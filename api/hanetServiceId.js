require("dotenv").config();
const fetch = require('node-fetch');
const tokenManager = require("./tokenManager");

const MAX_SEGMENT_SIZE = 6 * 60 * 60 * 1000; // 6 hours per segment
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const HANET_API_BASE_URL = process.env.HANET_API_BASE_URL;

// Validate base URL
if (!HANET_API_BASE_URL) {
  console.error("Error: HANET_API_BASE_URL environment variable is not set");
  throw new Error("Missing HANET_API_BASE_URL configuration");
}

async function getPeopleListByMethod(placeId, dateFrom, dateTo, devices) {
  try {
    console.log('getPeopleListByMethod called with:', {
      placeId,
      dateFrom: new Date(parseInt(dateFrom)).toLocaleString(),
      dateTo: new Date(parseInt(dateTo)).toLocaleString(),
      devices
    });

    // Get access token
    const accessToken = await tokenManager.getValidHanetToken();
    if (!accessToken) {
      throw new Error('Could not get valid access token');
    }

    // Split into smaller segments
    const segments = [];
    let startTime = parseInt(dateFrom);
    const endTime = parseInt(dateTo);

    while (startTime < endTime) {
      segments.push({
        start: startTime,
        end: Math.min(startTime + MAX_SEGMENT_SIZE, endTime)
      });
      startTime += MAX_SEGMENT_SIZE;
    }

    console.log(`Split into ${segments.length} segments (Hanet API calls)`);

    let hanetApiCallCount = 0; // Đếm số lần gọi Hanet API
    const allResults = new Map();
    const failedSegments = [];

    // Hàm gọi API cho 1 segment
    async function fetchSegment(segment) {
      try {
        hanetApiCallCount++;
        const url = `${HANET_API_BASE_URL}/person/getCheckinByPlaceIdInTimestamp`;
        const formData = new URLSearchParams({
          token: accessToken,
          placeID: placeId,
          from: segment.start.toString(),
          to: segment.end.toString(),
          size: 200
        });
        if (devices) {
          formData.append('devices', devices);
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const result = await response.json();
        if (result.returnCode !== 1 && result.returnCode !== 0) {
          throw new Error(result.returnMessage || 'Unknown API error');
        }
        return result.data || [];
      } catch (error) {
        segment.error = error;
        return segment; // Trả về segment lỗi để retry
      }
    }

    // Gọi song song các segment
    const segmentResults = await Promise.all(segments.map(fetchSegment));

    // Gom kết quả và xác định segment lỗi
    segmentResults.forEach((dataOrSegment, idx) => {
      if (Array.isArray(dataOrSegment)) {
        // Thành công, xử lý dữ liệu
        dataOrSegment.forEach(record => {
          if (record && record.personID) {
            const key = `${record.date || new Date(parseInt(record.checkinTime)).toISOString().split('T')[0]}_${record.personID}`;
            if (!allResults.has(key)) {
              allResults.set(key, {
                records: [],
                personInfo: {
                  personName: record.personName || "",
                  personID: record.personID,
                  aliasID: record.aliasID || "",
                  placeID: record.placeID || null,
                  title: record.title ? (typeof record.title === "string" ? record.title.trim() : "N/A") : "Customer",
                  date: record.date || new Date(parseInt(record.checkinTime)).toISOString().split('T')[0],
                }
              });
            }
            allResults.get(key).records.push({
              time: record.checkinTime,
              formattedTime: formatTimestamp(record.checkinTime)
            });
          }
        });
      } else {
        // Lỗi, thêm vào danh sách retry
        dataOrSegment.retryCount = 1;
        failedSegments.push(dataOrSegment);
      }
    });

    // Retry các segment lỗi (song song, tối đa MAX_RETRIES)
    for (let retry = 1; retry <= MAX_RETRIES && failedSegments.length > 0; retry++) {
      console.log(`Retry round ${retry} for ${failedSegments.length} failed segments`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      const retryResults = await Promise.all(failedSegments.map(fetchSegment));
      failedSegments.length = 0; // clear
      retryResults.forEach((dataOrSegment) => {
        if (Array.isArray(dataOrSegment)) {
          // Thành công, xử lý dữ liệu
          dataOrSegment.forEach(record => {
            if (record && record.personID) {
              const key = `${record.date || new Date(parseInt(record.checkinTime)).toISOString().split('T')[0]}_${record.personID}`;
              if (!allResults.has(key)) {
                allResults.set(key, {
                  records: [],
                  personInfo: {
                    personName: record.personName || "",
                    personID: record.personID,
                    aliasID: record.aliasID || "",
                    placeID: record.placeID || null,
                    title: record.title ? (typeof record.title === "string" ? record.title.trim() : "N/A") : "Customer",
                    date: record.date || new Date(parseInt(record.checkinTime)).toISOString().split('T')[0],
                  }
                });
              }
              allResults.get(key).records.push({
                time: record.checkinTime,
                formattedTime: formatTimestamp(record.checkinTime)
              });
            }
          });
        } else {
          // Lỗi, tăng retryCount
          dataOrSegment.retryCount = (dataOrSegment.retryCount || 1) + 1;
          if (dataOrSegment.retryCount <= MAX_RETRIES) {
            failedSegments.push(dataOrSegment);
          }
        }
      });
    }

    // Sau khi hoàn thành, log tổng số lần gọi Hanet API
    console.log(`[HANET API] Tổng số lần gọi Hanet API cho truy vấn này: ${hanetApiCallCount}`);

    // Process results
    const results = [];
    // Gom tất cả bản ghi theo personID, sắp xếp theo thời gian
    const allPersonRecords = new Map();
    for (const [_, group] of allResults) {
      const pid = group.personInfo.personID;
      if (!allPersonRecords.has(pid)) allPersonRecords.set(pid, []);
      group.records.forEach(r => {
        allPersonRecords.get(pid).push({
          ...group.personInfo,
          time: r.time,
          formattedTime: r.formattedTime,
          date: group.personInfo.date // ngày của bản ghi này
        });
      });
    }
    // Sắp xếp tất cả bản ghi của mỗi personID theo thời gian tăng dần
    for (const [pid, recs] of allPersonRecords) {
      recs.sort((a, b) => parseInt(a.time) - parseInt(b.time));
      // Tìm index đầu tiên của mỗi ngày
      const dayStartIndexes = [];
      let lastDate = null;
      for (let i = 0; i < recs.length; i++) {
        if (recs[i].date !== lastDate) {
          dayStartIndexes.push(i);
          lastDate = recs[i].date;
        }
      }
      // Duyệt qua các ngày
      for (let d = 0; d < dayStartIndexes.length; d++) {
        const startIdx = dayStartIndexes[d];
        const endIdx = (d + 1 < dayStartIndexes.length) ? dayStartIndexes[d + 1] - 1 : recs.length - 1;
        const checkinRecord = recs[startIdx];
        const checkoutRecord = recs[endIdx];
        // Tính workingTime
        let workingTime = "N/A";
        if (checkinRecord && checkoutRecord) {
          const checkinTime = parseInt(checkinRecord.time);
          const checkoutTime = parseInt(checkoutRecord.time);
          if (checkinTime === checkoutTime) {
            workingTime = "0h 0m";
          } else {
            const durationMinutes = (checkoutTime - checkinTime) / (1000 * 60);
            const hours = Math.floor(Math.abs(durationMinutes) / 60);
            const minutes = Math.floor(Math.abs(durationMinutes) % 60);
            workingTime = `${hours}h ${minutes}m`;
          }
        }
        results.push({
          ...checkinRecord,
          checkinTime: checkinRecord.time,
          checkoutTime: checkoutRecord ? checkoutRecord.time : null,
          formattedCheckinTime: checkinRecord.formattedTime,
          formattedCheckoutTime: checkoutRecord ? checkoutRecord.formattedTime : null,
          workingTime: workingTime,
          totalRecords: endIdx - startIdx + 1
        });
      }
    }
    // Sort results by date và check-in time
    results.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return parseInt(a.checkinTime) - parseInt(b.checkinTime);
    });
    console.log(`Final results: ${results.length} records processed.`);
    return results;
  } catch (error) {
    console.error("Error processing data:", error);
    throw error; // Re-throw to handle in the calling code
  }
}

function formatTimestamp(timestamp) {
  // Ensure timestamp is a number
  const ts = parseInt(timestamp, 10);
  
  // Create Date object with timestamp
  const date = new Date(ts);
  
  // Convert to Vietnam time (UTC+7)
  const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  
  // Format time components
  const hours = vietnamTime.getUTCHours().toString().padStart(2, "0");
  const minutes = vietnamTime.getUTCMinutes().toString().padStart(2, "0");
  const seconds = vietnamTime.getUTCSeconds().toString().padStart(2, "0");
  const day = vietnamTime.getUTCDate().toString().padStart(2, "0");
  const month = (vietnamTime.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = vietnamTime.getUTCFullYear();
  
  // Return format: HH:MM:SS DD/MM/YYYY
  return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

module.exports = {
  getPeopleListByMethod
};