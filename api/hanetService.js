// hanetService.js

function filterUniqueCheckinsPerPersonDay(data) {
  const uniqueCheckins = [];
  const seenCombinations = new Set();
  if (!Array.isArray(data)) {
    console.error("Dữ liệu đầu vào của filter không phải là mảng!");
    return [];
  }
  for (const checkin of data) {
    if (!checkin.personID || checkin.personID === "") {
      continue;
    }
    const combinationKey = `${checkin.personID}_${checkin.date}`;
    if (!seenCombinations.has(combinationKey)) {
      seenCombinations.add(combinationKey);
      const selectedData = {
        personName: checkin.personName !== undefined ? checkin.personName : "",
        personID: checkin.personID,
        aliasID: checkin.aliasID !== undefined ? checkin.aliasID : "",
        placeID: checkin.placeID !== undefined ? checkin.placeID : null,
        title: checkin.title
          ? typeof checkin.title === "string"
            ? checkin.title.trim()
            : "N/A"
          : "Khách hàng",
        type: checkin.type !== undefined ? checkin.type : null,
        deviceID: checkin.deviceID !== undefined ? checkin.deviceID : "",
        deviceName: checkin.deviceName !== undefined ? checkin.deviceName : "",
        checkinTime:
          checkin.checkinTime !== undefined ? checkin.checkinTime : null,
      };
      uniqueCheckins.push(selectedData);
    }
  }
  return uniqueCheckins;
}

require("dotenv").config();
const axios = require("axios");
const qs = require("qs");
const tokenManager = require("./tokenManager");
const tokenValidator = require("./tokenValidator");
const { getAllPlace } = require("./getPlaceId");
const HANET_API_BASE_URL = process.env.HANET_API_BASE_URL || "https://partner.hanet.ai";

if (!HANET_API_BASE_URL) {
  console.error("Lỗi: Biến môi trường HANET_API_BASE_URL chưa được thiết lập.");
}

/**
 * Lấy token hoạt động đã được xác minh với API Hanet
 * @param {Object} options - Tùy chọn
 * @param {boolean} options.forceVerify - Buộc xác minh token với API Hanet
 * @param {boolean} options.forceRefresh - Buộc làm mới token trước khi xác minh
 * @returns {Promise<string>} Access token hợp lệ
 */
async function getWorkingToken(options = {}) {
  try {
    const { forceVerify = false, forceRefresh = false } = options;
    const requestId = `token-${Date.now().toString(36)}`;
    
    // Nếu không yêu cầu xác minh, chỉ lấy token từ tokenManager
    if (!forceVerify) {
      return await tokenManager.getValidHanetToken();
    }
    
    // Sử dụng bộ xác thực token để đảm bảo token hợp lệ với API Hanet
    console.log(`[${requestId}] Lấy token đã được xác minh với Hanet API...`);
    const tokenValidator = require('./tokenValidator');
    
    // Lấy token đã được xác minh
    const token = await tokenValidator.getVerifiedToken({ forceRefresh });
    console.log(`[${requestId}] Đã lấy được token hợp lệ đã được xác minh`);
    return token;
  } catch (error) {
    console.error('Lỗi khi lấy token hoạt động:', error.message);
    
    // Phân loại lỗi để giúp debug và xử lý tốt hơn
    if (error.message.includes('network') || error.message.includes('timeout')) {
      throw new Error(`Lỗi kết nối mạng khi xác thực token: ${error.message}`);
    } else if (error.message.includes('hết hạn') || error.message.includes('expired')) {
      throw new Error(`Token đã hết hạn và không thể làm mới: ${error.message}`);
    } else if (error.message.includes('refresh')) {
      throw new Error(`Lỗi khi làm mới token: ${error.message}`);
    }
    
    // Lỗi chung
    throw new Error(`Không thể lấy token hợp lệ: ${error.message}`);
  }
}

async function getPeopleListByPlace() {
  const requestId = `people-list-${Date.now().toString(36)}`;
  let places = [];
  let allRawResults = [];

  try {
    // Lấy danh sách places
    console.log(`[${requestId}] Đang lấy danh sách places...`);
    places = await getAllPlace();
  } catch (error) {
    console.error(`[${requestId}] Lỗi khi lấy danh sách places:`, error);
    throw new Error("Không thể lấy danh sách địa điểm");
  }

  try {
    if (!places || !Array.isArray(places) || places.length === 0) {
      console.warn(`[${requestId}] Không có địa điểm nào được tìm thấy.`);
      return [];
    }

    console.log(`[${requestId}] Tìm thấy ${places.length} địa điểm.`);

    // Sử dụng getWorkingToken để đảm bảo token hoạt động
    console.log(`[${requestId}] Đang lấy token đã xác minh...`);
    const token = await getWorkingToken();
    
    if (!token) {
      throw new Error("Không thể lấy token hợp lệ từ Hanet API");
    }

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    const fromDate = Date.parse(`${dateString}T00:00:00`) / 1000;
    const toDate = Date.parse(`${dateString}T23:59:59`) / 1000;

    for (const place of places) {
      if (!place || typeof place.id === "undefined") {
        console.warn(`[${requestId}] Bỏ qua địa điểm không có ID:`, place);
        continue;
      }
      const currentPlaceId = place.id;

      const apiUrl = `${HANET_API_BASE_URL}/person/getCheckinByPlaceIdInTimestamp`;
      const requestData = {
        token: token,  // Sử dụng token đã được xác minh
        placeID: currentPlaceId,
        from: fromDate,
        to: toDate,
      };
      const config = {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      };
      console.log(`[${requestId}] Đang gọi HANET API: ${apiUrl} với placeID=${currentPlaceId}`);
      try {
        const response = await axios.post(
          apiUrl,
          qs.stringify(requestData),
          config
        );

        if (response.data && typeof response.data.returnCode !== "undefined") {
          if (response.data.returnCode === 1 || response.data.returnCode === 0) {
            console.log(`[${requestId}] Gọi HANET API thành công cho placeID=${currentPlaceId}`);
            if (Array.isArray(response.data.data)) {
              allRawResults.push(...response.data.data);
            } else {
              console.warn(
                `[${requestId}] Dữ liệu trả về cho placeID ${currentPlaceId} không phải mảng.`
              );
            }
          } else {
            console.error(
              `[${requestId}] Lỗi logic từ HANET cho placeID=${currentPlaceId}:`,
              response.data
            );
            console.warn(
              `[${requestId}] Bỏ qua địa điểm ${currentPlaceId} do lỗi API: ${response.data.returnCode}`
            );
          }
        } else {
          console.error(
            `[${requestId}] Response không hợp lệ từ HANET cho placeID=${currentPlaceId}:`,
            response.data
          );
          console.warn(
            `[${requestId}] Bỏ qua địa điểm ${currentPlaceId} do response không hợp lệ.`
          );
        }
      } catch (error) {
        console.error(
          `[${requestId}] Lỗi khi gọi ${apiUrl} cho placeID=${currentPlaceId}:`,
          error.response?.data || error.message
        );

        console.warn(`[${requestId}] Bỏ qua địa điểm ${currentPlaceId} do lỗi request.`);
      }
    }

    console.log(`[${requestId}] Tổng số bản ghi thô từ API: ${allRawResults.length}`);

    const filteredData = filterUniqueCheckinsPerPersonDay(allRawResults);
    console.log(`[${requestId}] Số bản ghi sau khi lọc: ${filteredData.length}`);

    return filteredData;
  } catch (error) {
    console.error(`[${requestId}] Lỗi trong quá trình lấy dữ liệu:`, error);
    throw new Error(`Không thể lấy dữ liệu từ Hanet API: ${error.message}`);
  }
}

module.exports = {
  getPeopleListByPlace,
  getWorkingToken
};
