"use strict";

const axios = require("axios");

/**
 * Client for communicating with Hailo Libero 3.0 device
 */
class HailoClient {
	/**
	 * @param {string} ip - Device IP address
	 * @param {number} port - Device port (default: 81)
	 * @param {string} password - Device password (default: hailo)
	 * @param {object} logger - Logger object (optional)
	 */
	constructor(ip, port = 81, password = "hailo", logger = null) {
		this.ip = ip;
		this.port = port;
		this.password = password;
		this.logger = logger;
		this.baseUrl = `http://${ip}:${port}`;
		this.authenticated = false;
		this.sessionCookie = null;

		// Create axios instance with default config
		this.client = axios.create({
			baseURL: this.baseUrl,
			timeout: 10000,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	/**
	 * Log message if logger is available
	 * @param {string} level - Log level (info, warn, error, debug)
	 * @param {string} message - Message to log
	 */
	log(level, message) {
		if (this.logger && typeof this.logger[level] === "function") {
			this.logger[level](message);
		}
	}

	/**
	 * Authenticate with the device
	 * @returns {Promise<boolean>} - Authentication success
	 */
	async authenticate() {
		try {
			this.log("debug", `Attempting to authenticate with ${this.baseUrl}`);

			// Try to login - this endpoint needs to be verified through reverse engineering
			const response = await this.client.post("/login", {
				password: this.password,
			});

			if (response.status === 200 && response.headers["set-cookie"]) {
				this.sessionCookie = response.headers["set-cookie"][0];
				this.authenticated = true;
				this.log("info", "Successfully authenticated with Hailo Libero device");
				return true;
			}

			this.log("warn", "Authentication response did not include session cookie");
			return false;
		} catch (error) {
			this.log("error", `Authentication failed: ${error.message}`);
			this.authenticated = false;
			return false;
		}
	}

	/**
	 * Test connection to device
	 * @returns {Promise<object>} - Connection test result
	 */
	async testConnection() {
		try {
			this.log("debug", `Testing connection to ${this.baseUrl}`);
			const response = await this.client.get("/", { timeout: 5000 });

			return {
				success: true,
				status: response.status,
				message: "Device is reachable",
			};
		} catch (error) {
			this.log("error", `Connection test failed: ${error.message}`);
			return {
				success: false,
				message: error.message,
			};
		}
	}

	/**
	 * Get device status
	 * @returns {Promise<object|null>} - Device status or null on error
	 */
	async getStatus() {
		try {
			this.log("debug", "Fetching device status");

			// Endpoint to be verified - common patterns: /status, /api/status, /state
			const response = await this.client.get("/status", {
				headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
			});

			if (response.status === 200) {
				this.log("debug", `Received status: ${JSON.stringify(response.data)}`);
				return response.data;
			}

			return null;
		} catch (error) {
			this.log("error", `Failed to get status: ${error.message}`);
			return null;
		}
	}

	/**
	 * Open the bin lid
	 * @returns {Promise<boolean>} - Command success
	 */
	async openLid() {
		try {
			this.log("info", "Sending open lid command");

			// Endpoint to be verified - common patterns: /open, /api/open, /command/open
			const response = await this.client.post(
				"/open",
				{},
				{
					headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
				},
			);

			if (response.status === 200) {
				this.log("info", "Successfully opened lid");
				return true;
			}

			return false;
		} catch (error) {
			this.log("error", `Failed to open lid: ${error.message}`);
			return false;
		}
	}

	/**
	 * Get device configuration/settings
	 * @returns {Promise<object|null>} - Device configuration or null on error
	 */
	async getConfig() {
		try {
			this.log("debug", "Fetching device configuration");

			// Endpoint to be verified
			const response = await this.client.get("/config", {
				headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
			});

			if (response.status === 200) {
				return response.data;
			}

			return null;
		} catch (error) {
			this.log("error", `Failed to get configuration: ${error.message}`);
			return null;
		}
	}

	/**
	 * Set device configuration/settings
	 * @param {object} config - Configuration object
	 * @returns {Promise<boolean>} - Command success
	 */
	async setConfig(config) {
		try {
			this.log("debug", `Setting device configuration: ${JSON.stringify(config)}`);

			const response = await this.client.post("/config", config, {
				headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
			});

			if (response.status === 200) {
				this.log("info", "Successfully updated configuration");
				return true;
			}

			return false;
		} catch (error) {
			this.log("error", `Failed to set configuration: ${error.message}`);
			return false;
		}
	}

	/**
	 * Get device information
	 * @returns {Promise<object|null>} - Device info or null on error
	 */
	async getDeviceInfo() {
		try {
			this.log("debug", "Fetching device information");

			const response = await this.client.get("/info", {
				headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
			});

			if (response.status === 200) {
				return response.data;
			}

			return null;
		} catch (error) {
			this.log("error", `Failed to get device info: ${error.message}`);
			return null;
		}
	}

	/**
	 * Control LED lighting
	 * @param {boolean} on - Turn LED on/off
	 * @returns {Promise<boolean>} - Command success
	 */
	async setLED(on) {
		try {
			this.log("info", `Turning LED ${on ? "on" : "off"}`);

			const response = await this.client.post(
				"/led",
				{ enabled: on },
				{
					headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
				},
			);

			if (response.status === 200) {
				return true;
			}

			return false;
		} catch (error) {
			this.log("error", `Failed to control LED: ${error.message}`);
			return false;
		}
	}

	/**
	 * Set sensor sensitivity
	 * @param {number} sensitivity - Sensitivity level (0-100)
	 * @returns {Promise<boolean>} - Command success
	 */
	async setSensitivity(sensitivity) {
		try {
			if (sensitivity < 0 || sensitivity > 100) {
				this.log("warn", "Sensitivity must be between 0 and 100");
				return false;
			}

			this.log("info", `Setting sensor sensitivity to ${sensitivity}`);

			const response = await this.client.post(
				"/sensitivity",
				{ value: sensitivity },
				{
					headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
				},
			);

			if (response.status === 200) {
				return true;
			}

			return false;
		} catch (error) {
			this.log("error", `Failed to set sensitivity: ${error.message}`);
			return false;
		}
	}

	/**
	 * Set ejection force
	 * @param {number} force - Force level (0-100)
	 * @returns {Promise<boolean>} - Command success
	 */
	async setEjectionForce(force) {
		try {
			if (force < 0 || force > 100) {
				this.log("warn", "Ejection force must be between 0 and 100");
				return false;
			}

			this.log("info", `Setting ejection force to ${force}`);

			const response = await this.client.post(
				"/force",
				{ value: force },
				{
					headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
				},
			);

			if (response.status === 200) {
				return true;
			}

			return false;
		} catch (error) {
			this.log("error", `Failed to set ejection force: ${error.message}`);
			return false;
		}
	}
}

module.exports = HailoClient;
