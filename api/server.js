require("dotenv").config();
const express = require("express");
const hanetService = require("./hanetService");
const getAllPlace = require("./getPlaceId");
const getDeviceById = require("./getDeviceByPlaceId");
const hanetServiceId = require("./hanetServiceId");
const cors = require("cors");
const tokenManager = require("./tokenManager");
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Request ID middleware
app.use((req, res, next) => {
  req.id = crypto.randomBytes(16).toString('hex');
  next();
});

// Logging middleware with request ID
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Request started - ID: ${req.id} ${req.method} ${req.originalUrl}`);
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] Request completed - ID: ${req.id} ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// CORS configuration
app.use(
  cors({
    origin: [
      "https://api-hanet.vercel.app",
      "http://localhost:3000",
      "https://client-hanet-re41.vercel.app"
    ],
  })
);
app.use(express.json());

// Middleware logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${
        res.statusCode
      } (${duration}ms)`
    );
  });
  next();
});

// Middleware xử lý CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Middleware tự động nạp cấu hình theo tài khoản (account)
app.use((req, res, next) => {
  const account = req.query.account || req.headers['x-account'];
  if (account) {
    try {
      tokenManager.useAccount(account);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản: ' + account });
    }
  }
  next();
});

// 2. Health check route
app.get("/api", (req, res) => {
  res.send("API Server is running!");
});

// 3. API Routes
app.get("/api/people", async (req, res, next) => {
  try {
    const peopleData = await hanetService.getPeopleListByPlace();
    res.status(200).json({ success: true, data: peopleData });
  } catch (error) {
    next(error);
  }
});

app.get("/api/place", async (req, res, next) => {
  try {
    console.log(`[${req.id}] Fetching places...`);
    const placeData = await getAllPlace.getAllPlace();
    
    // Validate and format data
    if (!Array.isArray(placeData)) {
      console.error(`[${req.id}] Invalid place data format:`, placeData);
      throw new Error('Invalid place data format received from Hanet API');
    }

    // Format places data
    const formattedPlaces = placeData.map(place => ({
      id: place.id || place.placeID,
      name: place.name || place.placeName || 'Unnamed Place'
    })).filter(place => place.id); // Filter out places without ID

    console.log(`[${req.id}] Returning ${formattedPlaces.length} places`);

    res.status(200).json({
      success: true,
      data: formattedPlaces
    });
  } catch (error) {
    console.error(`[${req.id}] Error fetching places:`, error);
    next(error);
  }
});

app.get("/api/device", async (req, res, next) => {
  try {
    const placeId = req.query.placeId;
    if (!placeId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu tham số bắt buộc: placeId"
      });
    }

    console.log(`[${req.id}] Fetching devices for placeId: ${placeId}`);
    
    const deviceData = await getDeviceById.getDeviceById(placeId);
    
    // Validate device data
    if (!deviceData) {
      console.log(`[${req.id}] No devices found for placeId: ${placeId}`);
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Ensure deviceData is an array
    const devices = Array.isArray(deviceData) ? deviceData : [deviceData];
    
    // Format device data
    const formattedDevices = devices.map(device => ({
      deviceID: device.deviceID || device.id,
      deviceName: device.deviceName || device.name || `Device ${device.deviceID || device.id}`,
      placeID: device.placeID || placeId
    })).filter(device => device.deviceID); // Filter out devices without ID

    console.log(`[${req.id}] Returning ${formattedDevices.length} devices`);

    res.status(200).json({
      success: true,
      data: formattedDevices
    });
  } catch (error) {
    console.error(`[${req.id}] Error fetching devices:`, error);
    next(error);
  }
});

// Middleware kiểm tra tham số cho route checkins
const validateCheckinParams = (req, res, next) => {
  const { placeId, dateFrom, dateTo } = req.query;

  if (!placeId) {
    return res.status(400).json({
      success: false,
      message: "Thiếu tham số bắt buộc: placeId",
    });
  }

  if (!dateFrom) {
    return res.status(400).json({
      success: false,
      message: "Thiếu tham số bắt buộc: dateFrom",
    });
  }

  if (!dateTo) {
    return res.status(400).json({
      success: false,
      message: "Thiếu tham số bắt buộc: dateTo",
    });
  }

  const fromTimestamp = parseInt(dateFrom, 10);
  const toTimestamp = parseInt(dateTo, 10);

  if (isNaN(fromTimestamp) || isNaN(toTimestamp)) {
    return res.status(400).json({
      success: false,
      message: "dateFrom và dateTo phải là millisecond timestamp hợp lệ.",
    });
  }

  if (fromTimestamp > toTimestamp) {
    return res.status(400).json({
      success: false,
      message: "Thời gian bắt đầu không được muộn hơn thời gian kết thúc.",
    });
  }

  // Lưu timestamp đã được validate vào request object
  req.validatedParams = {
    placeId,
    fromTimestamp,
    toTimestamp,
    devices: req.query.devices,
  };

  next();
};

app.get("/api/checkins", validateCheckinParams, async (req, res, next) => {
  try {
    const { placeId, fromTimestamp, toTimestamp, devices } = req.validatedParams;

    // Log request details
    console.log('Request params:', {
      placeId,
      fromTimestamp: new Date(parseInt(fromTimestamp)).toLocaleString(),
      toTimestamp: new Date(parseInt(toTimestamp)).toLocaleString(),
      devices,
      requestId: req.id
    });

    // Performance monitoring
    const startTime = process.hrtime();
    
    try {
      // Validate token before making the request
      const token = await tokenManager.getValidHanetToken();
      if (!token) {
        throw new Error('Failed to obtain valid access token');
      }

      const filteredCheckins = await hanetServiceId.getPeopleListByMethod(
        placeId,
        fromTimestamp,
        toTimestamp,
        devices
      );
      
      // Calculate execution time
      const endTime = process.hrtime(startTime);
      const timeInSeconds = endTime[0] + endTime[1] / 1e9;
      
      // Log response details
      console.log('API Response:', {
        requestId: req.id,
        recordCount: Array.isArray(filteredCheckins) ? filteredCheckins.length : 'invalid',
        executionTime: timeInSeconds.toFixed(2) + 's'
      });

      // Validate response format
      if (!Array.isArray(filteredCheckins)) {
        throw new Error('Invalid response format from Hanet service');
      }

      // Send success response with metadata
      res.status(200).json({
        success: true,
        metadata: {
          recordCount: filteredCheckins.length,
          timeRange: {
            from: new Date(parseInt(fromTimestamp)).toISOString(),
            to: new Date(parseInt(toTimestamp)).toISOString()
          },
          executionTime: timeInSeconds.toFixed(2) + 's'
        },
        data: filteredCheckins
      });
    } catch (error) {
      // Log detailed error information
      console.error('Error details:', {
        requestId: req.id,
        message: error.message,
        stack: error.stack,
        code: error.code,
        params: {
          placeId,
          fromTimestamp,
          toTimestamp,
          devices
        }
      });

      // Handle specific error types
      if (error.message.includes('authentication') || error.message.includes('token')) {
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'Failed to authenticate with Hanet API'
        });
      }
      
      if (error.message.includes('API error: 429')) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests to Hanet API, please try again later'
        });
      }

      // General error response
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An error occurred while processing your request',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } catch (error) {
    next(error);
  }
});

// API cấu hình OAuth
app.post("/api/oauth/config", (req, res) => {
  try {
    const { clientId, clientSecret, refreshToken, baseUrl, tokenUrl } = req.body;
    
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp Client ID và Client Secret",
      });
    }
    
    const config = {
      clientId,
      clientSecret,
      refreshToken: refreshToken || null,
      baseUrl: baseUrl || "https://partner.hanet.ai",
      tokenUrl: tokenUrl || "https://oauth.hanet.com/token"
    };
    
    tokenManager.setDynamicConfig(config);
    
    return res.status(200).json({
      success: true,
      message: "Cấu hình OAuth đã được cập nhật",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật cấu hình OAuth:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật cấu hình: " + error.message,
    });
  }
});

// API lấy cấu hình hiện tại
app.get("/api/oauth/config", (req, res) => {
  try {
    const config = tokenManager.getCurrentConfig();
    
    // Ẩn client secret khi trả về client
    const safeConfig = {
      ...config,
      clientSecret: config.clientSecret ? "******" : null,
      refreshToken: config.refreshToken ? "******" : null,
    };
    
    return res.status(200).json({
      success: true,
      data: safeConfig,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy cấu hình: " + error.message,
    });
  }
});

// API xử lý OAuth callback
app.get("/api/oauth/callback", async (req, res) => {
  try {
    const { code, redirect_uri } = req.query;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Thiếu code xác thực",
      });
    }
    
    const tokenData = await tokenManager.exchangeCodeForToken(code, redirect_uri);
    
    console.log("[OAuth Callback] Đã nhận token data:", {
      hasAccessToken: !!tokenData.accessToken,
      hasRefreshToken: !!tokenData.refreshToken,
      expiresIn: tokenData.expiresIn
    });
    
    return res.status(200).json({
      success: true,
      message: "Xác thực thành công",
      data: {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: tokenData.expiresIn,
      },
    });
  } catch (error) {
    console.error("Lỗi xử lý OAuth callback:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi xử lý OAuth callback: " + error.message,
    });
  }
});

// API kiểm tra trạng thái xác thực
app.get("/api/oauth/status", async (req, res) => {
  try {
    const config = tokenManager.getCurrentConfig();
    let status = "unconfigured";
    let message = "Chưa cấu hình OAuth";
    
    if (config.clientId && config.clientSecret) {
      status = "configured";
      message = "Đã cấu hình OAuth";
      
      try {
        const token = await tokenManager.getValidHanetToken();
        if (token) {
          status = "authenticated";
          message = "Đã xác thực thành công";
        }
      } catch (tokenError) {
        status = "error";
        message = "Lỗi xác thực: " + tokenError.message;
      }
    }
    
    return res.status(200).json({
      success: true,
      data: {
        status,
        message,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra trạng thái: " + error.message,
    });
  }
});

// API lấy thông tin người dùng
app.get("/api/user/info", async (req, res) => {
  try {
    console.log("[USER INFO] Bắt đầu truy vấn thông tin người dùng");
    const token = await tokenManager.getValidHanetToken();
    const config = tokenManager.getCurrentConfig();
    
    console.log(`[USER INFO] Gọi API Hanet: ${config.baseUrl}/api/v3/account/info`);
    const response = await fetch(`${config.baseUrl}/api/v3/account/info`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const userData = await response.json();
    console.log("[USER INFO] Dữ liệu nhận được từ Hanet:", JSON.stringify(userData));
    
    if (userData.code === '1' && userData.data) {
      const userInfo = {
        username: userData.data.username,
        name: userData.data.name || userData.data.username,
        email: userData.data.email
      };
      console.log("[USER INFO] Dữ liệu trả về cho client:", JSON.stringify(userInfo));
      
      return res.status(200).json({
        success: true,
        data: userInfo
      });
    } else {
      console.log("[USER INFO] Lỗi định dạng dữ liệu:", userData);
      throw new Error('Không thể lấy thông tin người dùng');
    }
  } catch (error) {
    console.error("[USER INFO] Lỗi:", error.message);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thông tin người dùng: " + error.message
    });
  }
});

// Thêm endpoint chuyển đổi tài khoản sử dụng
app.post("/api/oauth/use-account", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, message: "Thiếu username" });
  try {
    tokenManager.useAccount(username);
    return res.json({ success: true, message: "Đã chuyển cấu hình thành công" });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 4. Error Handling Middleware
const handleApiError = (err, req, res, next) => {
  console.error(`Lỗi trong route ${req.path}:`, err.message);
  console.error(err.stack);

  if (err.message && err.message.startsWith("HANET Error 401")) {
    return res.status(401).json({
      success: false,
      message: "Lỗi xác thực với HANET API",
    });
  }

  if (err.message && err.message.includes("place not found")) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy địa điểm",
    });
  }

  if (err.message && err.message.startsWith("HANET API Error")) {
    return res.status(502).json({
      success: false,
      message: "Lỗi từ HANET API khi lấy dữ liệu",
      error: process.env.NODE_ENV === "production" ? undefined : err.message,
    });
  }

  res.status(500).json({
    success: false,
    message: "Lỗi máy chủ nội bộ",
    error: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
};

app.use(handleApiError);

// Middleware xử lý lỗi chung
app.use((err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    query: req.query
  });

  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(504).json({
      success: false,
      message: 'Request timeout. Vui lòng thử lại với khoảng thời gian ngắn hơn.'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ nội bộ. ' + (process.env.NODE_ENV === 'development' ? err.message : '')
  });
});

if (process.env.PORT !== "production") {
  app.listen(PORT, () => {
    console.log(`Server đang lắng nghe trên cổng ${PORT}`);
    console.log(`Truy cập tại: http://localhost:${PORT}`);
  });
}

module.exports = app;
