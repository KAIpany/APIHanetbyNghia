require("dotenv").config();
const express = require("express");
const hanetService = require("./hanetService");
const getAllPlace = require("./getPlaceId");
const getDeviceById = require("./getDeviceByPlaceId");
const hanetServiceId = require("./hanetServiceId");
const cors = require("cors");
const tokenManager = require("./tokenManager");
const crypto = require('crypto');
const mongodbStorage = require('./mongodbStorage');

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
      "https://client-hanet-re41.vercel.app",
      "https://api-fe-hanetby-nghia.vercel.app",
      "https://api-be-hanetby-nghia.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
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

// Middleware tự động cấu hình xác thực dựa vào placeId
const autoConfigureByPlaceId = async (req, res, next) => {
  try {
    const placeId = req.query.placeId;
    if (!placeId) {
      return next();
    }

    console.log(`[${req.id}] Tự động cấu hình xác thực cho placeId: ${placeId}`);

    // Kết nối đến MongoDB và lấy cấu hình cho placeId
    const { db } = await mongodbStorage.connectToDatabase();
    const configCollection = db.collection('oauthConfigs');
    
    // Tìm cấu hình cho placeId này
    const config = await configCollection.findOne({ placeIds: placeId });
    
    if (!config) {
      console.log(`[${req.id}] Không tìm thấy cấu hình cho placeId: ${placeId}`);
      return next();
    }

    // Cập nhật cấu hình hiện tại
    console.log(`[${req.id}] Đã tìm thấy cấu hình cho placeId: ${placeId}, đang áp dụng...`);
    await tokenManager.setDynamicConfig(config);

    next();
  } catch (error) {
    console.error(`[${req.id}] Lỗi khi tự động cấu hình:`, error);
    next(error);
  }
};

// Thêm middleware vào trước các route API
app.use('/api', autoConfigureByPlaceId);

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
app.post("/api/oauth/config", async (req, res) => {
  try {
    const { clientId, clientSecret, refreshToken, baseUrl, tokenUrl, appName, username, placeIds } = req.body;
    
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
      tokenUrl: tokenUrl || "https://oauth.hanet.com/token",
      appName: appName || null,
      username: username || null,
      placeIds: placeIds || [], // Thêm danh sách placeId được phép sử dụng cấu hình này
      createdAt: new Date()
    };
    
    // Lưu cấu hình vào MongoDB
    const configKey = appName || username || 'default';
    await mongodbStorage.saveOAuthConfig(configKey, config);
    console.log(`[${new Date().toISOString()}] Đã lưu cấu hình ${configKey} vào MongoDB với ${config.placeIds.length} placeId`);
    
    // Đặt làm cấu hình active
    await mongodbStorage.setActiveConfig(configKey);
    console.log(`[${new Date().toISOString()}] Đã đặt ${configKey} làm cấu hình đang hoạt động`);
    
    // Cập nhật cấu hình hiện tại
    tokenManager.setDynamicConfig(config);
    // Cập nhật username hiện tại
    tokenManager.useAccount(configKey);
    
    return res.status(200).json({
      success: true,
      message: "Cấu hình OAuth đã được lưu vào MongoDB",
      configName: configKey,
      placeIds: config.placeIds
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật cấu hình OAuth:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lưu cấu hình: " + error.message,
    });
  }
});

// API lấy danh sách cấu hình từ MongoDB
app.get("/api/oauth/configs", async (req, res) => {
  try {
    const configNames = await mongodbStorage.getConfigNames();
    
    return res.status(200).json({
      success: true,
      data: configNames
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách cấu hình:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách cấu hình: " + error.message
    });
  }
});

// API lấy chi tiết cấu hình từ MongoDB
app.get("/api/oauth/config/:name", async (req, res) => {
  try {
    const configName = req.params.name;
    const config = await mongodbStorage.getOAuthConfig(configName);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy cấu hình: ${configName}`
      });
    }
    
    // Ẩn các thông tin nhạy cảm khi trả về client
    const safeConfig = {
      ...config,
      clientSecret: config.clientSecret ? "******" : null,
      refreshToken: config.refreshToken ? "******" : null,
    };
    
    return res.status(200).json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error(`Lỗi khi lấy cấu hình ${req.params.name}:`, error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy cấu hình: " + error.message
    });
  }
});

// API kích hoạt cấu hình OAuth - phiên bản tối ưu cho serverless
app.post("/api/oauth/activate/:name", async (req, res) => {
  const requestId = req.id;
  const configName = req.params.name;
  
  console.log(`[${requestId}] Yêu cầu kích hoạt cấu hình: ${configName}`);
  
  // Khởi tạo hàm tạo timeout
  const timeoutPromise = (promise, timeoutMs = 3000) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  };
  
  try {
    // Tìm cấu hình trong MongoDB với timeout
    let config;
    try {
      config = await timeoutPromise(mongodbStorage.getOAuthConfig(configName), 3000);
    } catch (timeoutErr) {
      console.error(`[${requestId}] Timeout khi tải cấu hình: ${timeoutErr.message}`);
      return res.status(504).json({
        success: false,
        message: `Timeout khi tải cấu hình ${configName}. Vui lòng thử lại.`
      });
    }
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy cấu hình: ${configName}`
      });
    }
    
    console.log(`[${requestId}] Đã tìm thấy cấu hình ${configName}, đang kích hoạt...`);
    
    // Thực hiện song song các thao tác không phụ thuộc nhau để tối ưu thời gian
    const [setActiveResult, setDynamicResult] = await Promise.allSettled([
      // Đặt làm cấu hình active trong MongoDB
      timeoutPromise(mongodbStorage.setActiveConfig(configName), 2000),
      // Cập nhật cấu hình hiện tại trong tokenManager
      timeoutPromise(Promise.resolve(tokenManager.setDynamicConfig(config)), 1000)
    ]);
    
    // Báo cáo nếu có lỗi nhưng không ngừng tiến trình
    if (setActiveResult.status === 'rejected') {
      console.error(`[${requestId}] Lỗi khi đặt cấu hình active:`, setActiveResult.reason);
    }
    
    if (setDynamicResult.status === 'rejected') {
      console.error(`[${requestId}] Lỗi khi cập nhật cấu hình tokenManager:`, setDynamicResult.reason);
    }
    
    // Sử dụng bộ xác thực token mới để kiểm tra tính hợp lệ thực tế của token
    // Trả về kết quả nhanh chóng trước, và tiếp tục kiểm tra token trong background
    const responseData = {
      success: true,
      message: `Đã kích hoạt cấu hình ${configName}`,
      configName: configName,
      tokenValidationPending: true // Cho client biết token đang được kiểm tra trong background
    };
    
    // Trả kết quả nhanh cho client trước
    res.status(200).json(responseData);
    
    // Tiếp tục kiểm tra token trong background (sau khi đã trả response)
    try {
      // Import bộ xác thực token
      const tokenValidator = require('./tokenValidator');
      
      console.log(`[${requestId}] Kiểm tra xác thực token với Hanet API trong background...`);
      const validToken = await tokenValidator.getVerifiedToken();
      
      if (validToken) {
        console.log(`[${requestId}] Xác thực với Hanet thành công cho cấu hình ${configName}`);
      } else {
        console.error(`[${requestId}] Không nhận được token hợp lệ từ Hanet API`);
      }
    } catch (tokenError) {
      console.error(`[${requestId}] Lỗi khi xác thực với Hanet API:`, tokenError.message);
      // Vì response đã được gửi, chúng ta chỉ log lỗi và không làm gì thêm
    }
    
    return; // Đã gửi response, không cần return gì thêm
  } catch (error) {
    console.error(`[${requestId}] Lỗi khi kích hoạt cấu hình ${configName}:`, error);
    // Nếu chưa gửi response, gửi lỗi
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Lỗi khi kích hoạt cấu hình: " + error.message
      });
    }
  }
});

// API xóa cấu hình từ MongoDB
app.delete("/api/oauth/config/:name", async (req, res) => {
  try {
    const configName = req.params.name;
    const { db } = await mongodbStorage.connectToDatabase();
    const collection = db.collection('oauthConfigs');
    
    const result = await collection.deleteOne({ _id: configName });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy cấu hình: ${configName}`
      });
    }
    
    return res.status(200).json({
      success: true,
      message: `Đã xóa cấu hình: ${configName}`
    });
  } catch (error) {
    console.error(`Lỗi khi xóa cấu hình ${req.params.name}:`, error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa cấu hình: " + error.message
    });
  }
});

// API xử lý OAuth callback - cập nhật để lưu vào MongoDB và tự động thêm placeIds
app.get("/api/oauth/callback", async (req, res) => {
  try {
    const { code, redirect_uri, configName } = req.query;
    
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

    // Lưu token vào MongoDB nếu có tên cấu hình
    if (configName && tokenData.refreshToken) {
      try {
        const existingConfig = await mongodbStorage.getOAuthConfig(configName);
        if (existingConfig) {
          existingConfig.refreshToken = tokenData.refreshToken;
          
          // Lấy danh sách places của người dùng
          console.log("[OAuth Callback] Đang lấy danh sách places...");
          const placesResponse = await fetch(`${existingConfig.baseUrl || 'https://partner.hanet.ai'}/api/v3/place`, {
            headers: {
              'Authorization': `Bearer ${tokenData.accessToken}`
            }
          });
          
          const placesData = await placesResponse.json();
          
          if (placesData.code === '1' && Array.isArray(placesData.data)) {
            console.log(`[OAuth Callback] Tìm thấy ${placesData.data.length} places`);
            
            // Lấy danh sách placeIds
            const placeIds = placesData.data.map(place => place.id.toString());
            
            // Thêm vào cấu hình
            existingConfig.placeIds = [...new Set([...(existingConfig.placeIds || []), ...placeIds])];
            console.log(`[OAuth Callback] Đã thêm ${placeIds.length} placeIds vào cấu hình`);
          }
          
          // Lưu cấu hình đã cập nhật
          await mongodbStorage.saveOAuthConfig(configName, existingConfig);
          console.log(`[${new Date().toISOString()}] Đã cập nhật refresh token và placeIds cho cấu hình ${configName}`);
        }
      } catch (storageError) {
        console.error(`[${new Date().toISOString()}] Lỗi lưu token vào MongoDB:`, storageError);
      }
    }
    
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

// API kiểm tra trạng thái xác thực - phiên bản tối ưu cho serverless
app.get("/api/oauth/status", async (req, res) => {
  const requestId = req.id;
  console.log(`[${requestId}] Kiểm tra trạng thái xác thực OAuth`);
  
  try {
    // Sử dụng Promise.race để tạo timeout cho các thao tác database
    const timeoutPromise = (promise, timeoutMs = 3000) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    };
    
    // Trước tiên, tải cấu hình hiện tại ngay lập tức
    const config = tokenManager.getCurrentConfig();
    let status = "unconfigured";
    let message = "Chưa cấu hình OAuth";
    let tokenInfo = null;
    let configName = null;
    
    // Kiểm tra xem đã có cấu hình chưa
    if (config.clientId && config.clientSecret) {
      status = "configured";
      message = "Đã cấu hình OAuth";
      
      // Song song tải cấu hình active và kiểm tra token
      try {
        // Song song các thao tác database để tối ưu thời gian
        const [activeConfigData, tokenResult] = await Promise.allSettled([
          // Tải cấu hình active (có timeout)
          timeoutPromise(mongodbStorage.getActiveConfig(), 2000),
          // Thử làm mới token
          (async () => {
            try {
              return await tokenManager.getValidHanetToken();
            } catch (err) {
              return { error: err };
            }
          })()
        ]);
        
        // Xử lý kết quả tải cấu hình active
        if (activeConfigData.status === 'fulfilled' && activeConfigData.value && activeConfigData.value.name) {
          configName = activeConfigData.value.name;
          console.log(`[${requestId}] Tìm thấy cấu hình đang hoạt động: ${configName}`);
          
          // Tải cấu hình ngay lập tức nếu cần - nhưng đặt timeout ngắn
          try {
            const storedConfig = await timeoutPromise(mongodbStorage.getConfig(configName), 2000);
            if (storedConfig && storedConfig.clientId && storedConfig.clientSecret) {
              // Đảm bảo cập nhật config trong background, không chờ
              tokenManager.setDynamicConfig(storedConfig)
                .catch(err => console.error(`[${requestId}] Lỗi khi cập nhật cấu hình:`, err.message));
            }
          } catch (configErr) {
            console.log(`[${requestId}] Timeout khi tải cấu hình, tiếp tục với cấu hình hiện tại`);
          }
        }
        
        // Xử lý kết quả kiểm tra token
        if (tokenResult.status === 'fulfilled') {
          const token = tokenResult.value;
          if (token && !token.error) {
            status = "authenticated";
            message = "Đã xác thực thành công";
            
            // Thêm thông tin về token để client có thể xử lý tốt hơn
            tokenInfo = {
              accessToken: token.substring(0, 10) + '...',  // Chỉ hiển thị 10 ký tự đầu
              configName: configName || 'default'
            };
          } else if (token && token.error) {
            status = "error";
            message = "Lỗi xác thực: " + token.error.message;
            console.error(`[${requestId}] Lỗi khi làm mới token:`, token.error.message);
          }
        } else if (tokenResult.status === 'rejected') {
          status = "error";
          message = "Lỗi xác thực: " + tokenResult.reason.message;
          console.error(`[${requestId}] Lỗi khi làm mới token:`, tokenResult.reason.message);
        }
      } catch (generalError) {
        console.error(`[${requestId}] Lỗi chung khi kiểm tra trạng thái:`, generalError.message);
        // Vẫn tiếp tục với trạng thái configured nếu có lỗi
      }
    }
    
    return res.status(200).json({
      success: true,
      data: {
        status,
        message,
        configName,
        tokenInfo
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

// Thêm API chuyển đổi tài khoản sử dụng từ MongoDB
app.post("/api/oauth/use-account", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, message: "Thiếu username" });
  try {
    // Lấy cấu hình từ MongoDB
    const config = await mongodbStorage.getOAuthConfig(username);
    if (!config) {
      return res.status(404).json({ 
        success: false, 
        message: `Không tìm thấy cấu hình cho tài khoản: ${username}` 
      });
    }
    
    // Cập nhật cấu hình hiện tại
    tokenManager.setDynamicConfig(config);
    
    return res.json({ 
      success: true, 
      message: `Đã chuyển sang sử dụng cấu hình: ${username}` 
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// API lấy cấu hình hiện tại (giữ lại cho tương thích ngược với client)
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

// API làm mới token OAuth
app.post("/api/oauth/refresh", async (req, res) => {
  try {
    const { refreshToken, clientId, clientSecret } = req.body;
    
    if (!refreshToken || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết để làm mới token"
      });
    }
    
    // Gọi API của Hanet để làm mới token
    const response = await fetch('https://oauth.hanet.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    
    const result = await response.json();
    
    if (result.access_token) {
      // Lưu token mới vào MongoDB nếu có
      try {
        await mongodbStorage.saveTokens({
          accessToken: result.access_token,
          refreshToken: result.refresh_token || refreshToken,
          expiresIn: result.expires_in,
          tokenType: result.token_type,
          scope: result.scope
        });
      } catch (dbError) {
        console.error("Lỗi khi lưu token mới vào MongoDB:", dbError);
      }
      
      return res.status(200).json({
        success: true,
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresIn: result.expires_in
        }
      });
    } else {
      throw new Error(result.error_description || 'Không thể làm mới token');
    }
  } catch (error) {
    console.error("Lỗi khi làm mới token:", error);
    return res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

// API thêm/xóa placeId cho một cấu hình
app.post("/api/oauth/config/:name/places", async (req, res) => {
  try {
    const configName = req.params.name;
    const { placeIds, action } = req.body; // action: 'add' hoặc 'remove'
    
    if (!Array.isArray(placeIds) || !action) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp danh sách placeIds và action (add/remove)"
      });
    }
    
    const { db } = await mongodbStorage.connectToDatabase();
    const collection = db.collection('oauthConfigs');
    
    // Lấy cấu hình hiện tại
    const currentConfig = await collection.findOne({ _id: configName });
    if (!currentConfig) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy cấu hình: ${configName}`
      });
    }
    
    // Cập nhật danh sách placeIds
    let updatedPlaceIds = currentConfig.placeIds || [];
    if (action === 'add') {
      updatedPlaceIds = [...new Set([...updatedPlaceIds, ...placeIds])];
    } else if (action === 'remove') {
      updatedPlaceIds = updatedPlaceIds.filter(id => !placeIds.includes(id));
    }
    
    // Cập nhật vào database
    await collection.updateOne(
      { _id: configName },
      { $set: { placeIds: updatedPlaceIds } }
    );
    
    return res.status(200).json({
      success: true,
      message: `Đã ${action === 'add' ? 'thêm' : 'xóa'} placeIds cho cấu hình ${configName}`,
      placeIds: updatedPlaceIds
    });
  } catch (error) {
    console.error(`Lỗi khi cập nhật placeIds:`, error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật placeIds: " + error.message
    });
  }
});

// API đồng bộ places với cấu hình
app.post("/api/oauth/config/:name/sync-places", async (req, res) => {
  try {
    const configName = req.params.name;
    
    // Lấy cấu hình hiện tại
    const config = await mongodbStorage.getOAuthConfig(configName);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy cấu hình: ${configName}`
      });
    }
    
    // Lấy token hợp lệ
    await tokenManager.setDynamicConfig(config);
    const token = await tokenManager.getValidHanetToken(true);
    
    // Lấy danh sách places
    console.log(`[Places Sync] Đang lấy danh sách places cho cấu hình ${configName}...`);
    const placesResponse = await fetch(`${config.baseUrl || 'https://partner.hanet.ai'}/api/v3/place`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const placesData = await placesResponse.json();
    
    if (placesData.code !== '1' || !Array.isArray(placesData.data)) {
      throw new Error('Không thể lấy danh sách places: ' + JSON.stringify(placesData));
    }
    
    // Lấy danh sách placeIds
    const placeIds = placesData.data.map(place => place.id.toString());
    
    // Cập nhật cấu hình
    config.placeIds = [...new Set([...(config.placeIds || []), ...placeIds])];
    await mongodbStorage.saveOAuthConfig(configName, config);
    
    console.log(`[Places Sync] Đã cập nhật ${placeIds.length} placeIds cho cấu hình ${configName}`);
    
    return res.status(200).json({
      success: true,
      message: `Đã đồng bộ ${placeIds.length} places cho cấu hình ${configName}`,
      data: {
        placeIds: config.placeIds,
        places: placesData.data.map(place => ({
          id: place.id,
          name: place.name
        }))
      }
    });
  } catch (error) {
    console.error(`[Places Sync] Lỗi:`, error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi đồng bộ places: " + error.message
    });
  }
});

// API kiểm tra trạng thái OAuth
app.get("/api/oauth/status", async (req, res) => {
  const requestId = `status-${Date.now().toString(36)}`;
  console.log(`[${requestId}] Kiểm tra trạng thái OAuth...`);
  
  // Kiểm tra xem có cấu hình active nào không
  try {
    // Lấy cấu hình active
    let activeConfigData = null;
    
    try {
      activeConfigData = await mongodbStorage.getActiveConfig();
    } catch (dbError) {
      console.error(`[${requestId}] Lỗi khi truy vấn cấu hình active:`, dbError);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy cấu hình từ cơ sở dữ liệu"
      });
    }
    
    if (!activeConfigData || !activeConfigData.configName) {
      return res.json({
        success: true,
        authenticated: false,
        hasActiveConfig: false,
        message: "Chưa có cấu hình OAuth nào được kích hoạt"
      });
    }
    
    // Lấy thông tin cấu hình
    let config;
    try {
      config = await mongodbStorage.getOAuthConfig(activeConfigData.configName);
    } catch (configError) {
      console.error(`[${requestId}] Lỗi khi lấy thông tin cấu hình:`, configError);
      return res.status(500).json({
        success: false,
        message: `Lỗi khi lấy thông tin cấu hình ${activeConfigData.configName}`
      });
    }
    
    if (!config) {
      return res.json({
        success: true,
        authenticated: false,
        hasActiveConfig: true,
        configName: activeConfigData.configName,
        message: `Cấu hình ${activeConfigData.configName} không tồn tại`
      });
    }
    
    // Đặt cấu hình vào tokenManager
    await tokenManager.setDynamicConfig(config);
    
    // Sử dụng bộ xác thực token mới để kiểm tra tính hợp lệ thực tế của token
    try {
      // Import bộ xác thực token
      const tokenValidator = require('./tokenValidator');
      
      // Lấy token đã được xác minh
      console.log(`[${requestId}] Kiểm tra xác thực token với Hanet API...`);
      const token = await tokenValidator.getVerifiedToken();
      
      const authenticatedData = {
        success: true,
        authenticated: true,
        hasActiveConfig: true,
        configName: activeConfigData.configName,
        message: `Đã xác thực với tài khoản Hanet: ${config.appName || config.clientId}`,
        data: {
          appName: config.appName,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          // Che dấu thông tin nhạy cảm
          clientId: config.clientId ? `${config.clientId.substring(0, 4)}...${config.clientId.substring(config.clientId.length - 4)}` : 'N/A',
          clientSecret: config.clientSecret ? `${config.clientSecret.substring(0, 2)}...${config.clientSecret.substring(config.clientSecret.length - 2)}` : 'N/A',
          tokenUrl: config.tokenUrl || "https://oauth.hanet.com/token",
          baseUrl: config.baseUrl || "https://partner.hanet.ai",
          refreshToken: config.refreshToken ? `${config.refreshToken.substring(0, 4)}...${config.refreshToken.substring(config.refreshToken.length - 4)}` : 'N/A',
          tokenVerified: true // Thêm trường này để chỉ ra rằng token đã được xác minh với API
        }
      };
      
      return res.json(authenticatedData);
    } catch (tokenError) {
      console.error(`[${requestId}] Lỗi khi kiểm tra token:`, tokenError);
      
      return res.json({
        success: false,
        authenticated: false,
        hasActiveConfig: true,
        configName: activeConfigData.configName,
        message: `Lỗi xác thực với Hanet API: ${tokenError.message}`,
        error: tokenError.message
      });
    }
  } catch (error) {
    console.error(`[${requestId}] Lỗi khi kiểm tra trạng thái OAuth:`, error);
    
    return res.status(500).json({
      success: false,
      message: `Lỗi khi kiểm tra trạng thái OAuth: ${error.message}`
    });
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

// Thiết lập cơ chế tự động làm mới token mỗi 12 giờ
let tokenRefreshInterval;

async function setupTokenRefreshCron() {
  // Hủy interval cũ nếu có
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
  }
  
  // Lấy cấu hình active
  try {
    const activeConfig = await tokenStorage.getActiveConfig();
    if (activeConfig && activeConfig.configName) {
      console.log(`[AUTO-REFRESH] Thiết lập cron job làm mới token tự động cho cấu hình: ${activeConfig.configName}`);
      
      // Làm mới token ngay lập tức
      try {
        await tokenManager.getValidHanetToken();
        console.log(`[AUTO-REFRESH] Đã làm mới token ban đầu thành công`);
      } catch (refreshError) {
        console.error(`[AUTO-REFRESH] Lỗi khi làm mới token ban đầu:`, refreshError.message);
      }
      
      // Thiết lập interval làm mới token mỗi 12 giờ
      // 12 giờ = 12 * 60 * 60 * 1000 = 43200000 ms
      tokenRefreshInterval = setInterval(async () => {
        const requestId = `auto-refresh-${Date.now()}`;
        console.log(`[${requestId}] [AUTO-REFRESH] Đang làm mới token tự động...`);
        
        try {
          await tokenManager.getValidHanetToken();
          console.log(`[${requestId}] [AUTO-REFRESH] Đã làm mới token tự động thành công`);
        } catch (error) {
          console.error(`[${requestId}] [AUTO-REFRESH] Lỗi khi làm mới token tự động:`, error.message);
        }
      }, 43200000); // 12 giờ
      
      console.log(`[AUTO-REFRESH] Đã thiết lập cron job làm mới token mỗi 12 giờ`);
    } else {
      console.log(`[AUTO-REFRESH] Không tìm thấy cấu hình active, không thiết lập cron job`);
    }
  } catch (error) {
    console.error(`[AUTO-REFRESH] Lỗi khi thiết lập cron job:`, error.message);
  }
}

// Khởi động server
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
    console.log(`Truy cập tại: http://localhost:${PORT}`);
    
    // Thiết lập cron job làm mới token
    setupTokenRefreshCron();
  });
} else {
  // Chỉ xuất module trong môi trường production (Vercel)
  // Tuy nhiên vẫn thiết lập cron job để duy trì kết nối
  setupTokenRefreshCron();
}

module.exports = app;
