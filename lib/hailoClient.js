"use strict";

const axios = require("axios");
const cheerio = require("cheerio");

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
	 * Ensure we are authenticated; tries checkAuth first then authenticate
	 */
	async ensureAuth() {
		const authed = await this.checkAuth();
		if (!authed) {
			return this.authenticate();
		}
		return true;
	}

	/**
	 * Authenticate with the device
	 * @returns {Promise<boolean>} - Authentication success
	 */
	async authenticate() {
		try {
			this.log("debug", `Attempting to authenticate with ${this.baseUrl}`);

			// Send form-encoded pin and prevent redirects; success is indicated by 301 redirect to '/'
			const params = new URLSearchParams();
			params.append("pin", this.password);

			try {
				await this.client.post("/login", params.toString(), {
					headers: { "Content-Type": "application/x-www-form-urlencoded", ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}) },
					maxRedirects: 0,
					validateStatus: (status) => status >= 200 && status < 400, // allow 3xx here
				});

				// If no error thrown and not redirected, treat as failure
				this.log("warn", "Authentication did not redirect; treating as failure");
				this.authenticated = false;
				return false;
			} catch (err) {
				const response = err.response;
				if (response && response.status === 301) {
					const location = response.headers["location"];
					if (location === "/") {
						// capture cookie if present
						if (response.headers["set-cookie"] && response.headers["set-cookie"][0]) {
							this.sessionCookie = response.headers["set-cookie"][0];
						}
						this.authenticated = true;
						this.log("info", "Successfully authenticated with Hailo Libero device");
						return true;
					}
				}
				this.log("warn", `Authentication failed with status ${response ? response.status : "no response"}`);
				this.authenticated = false;
				return false;
			}
		} catch (error) {
			this.log("error", `Authentication failed: ${error.message}`);
			this.authenticated = false;
			return false;
		}
	}

	/**
	 * Build headers including Cookie if available
	 * @returns {object}
	 */
	getAuthHeaders() {
		return this.sessionCookie ? { Cookie: this.sessionCookie } : {};
	}

	/**
	 * Check if already authenticated by probing '/'
	 * @returns {Promise<boolean>}
	 */
	async checkAuth() {
		try {
			const response = await this.client.get("/", {
				maxRedirects: 0,
				validateStatus: (s) => s >= 200 && s < 400,
				headers: this.getAuthHeaders(),
			});
			if (response.status === 200) {
				this.authenticated = true;
				return true;
			}
			if (response.status === 301) {
				this.authenticated = false;
				return false;
			}
			return false;
		} catch (error) {
			this.log("error", `checkAuth failed: ${error.message}`);
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
			await this.ensureAuth();

			const response = await this.client.get("/push", {
				headers: this.getAuthHeaders(),
			});

			const data = typeof response.data === "string" ? response.data : "";
			if (response.status === 200 && data.trim() === "OK") {
				this.log("info", "Successfully opened lid");
				return true;
			}

			this.log("warn", `Open lid failed: status ${response.status}, body: ${data}`);
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
		let htmlString;
		try {
			await this.ensureAuth();
			const response = await this.client.get("/", { headers: this.getAuthHeaders() });
			htmlString = response.data;
		} catch (error) {
			this.log("error", `Fehler beim Abrufen der Daten von ${this.baseUrl}: ${error.message}`);
			return null;
		}

		const parsed = this.parseSettingsAndInfoFromHtml(htmlString);
		return parsed;
	}

	/**
	 * Parse settings and info from the device homepage HTML
	 * @param {string} htmlString
	 * @returns {{settings: object, info: object}}
	 */
	parseSettingsAndInfoFromHtml(htmlString) {
		const $ = cheerio.load(htmlString);

		const settings = {};
		const info = {};

		$("input:not(.button)").each((i, el) => {
			const input = $(el);

			// Überspringe Radio-Buttons, die nicht ausgewählt sind
			if (input.attr("type") === "radio" && !input.is(":checked")) {
				return; // weiter zum nächsten Element
			}

			const name = input.attr("name");
			if (!name) return;

			// Wenn es ein 'range'-Typ ist
			if (input.attr("type") === "range") {
				settings[name] = {
					value: parseInt(input.attr("value"), 10),
					min: parseInt(input.attr("min"), 10),
					max: parseInt(input.attr("max"), 10)
				};
			} else {
				// Speziell für 'ipconf' (boolescher Wert im Python-Modell)
				if (name === "ipconf") {
					settings[name] = input.attr("value") === "1"; // "1" -> true, "0" -> false
				} else {
					settings[name] = input.attr("value");
				}
			}
		});

		// --- Infos extrahieren (HailoInfo) ---
		const p = $("p").first();

		if (p) {
			const spans = p.find("span");

			// Helper-Funktion, um den Text-Knoten nach einem Span zu erhalten
			const getNextText = (spanNode) => {
				if (spanNode && spanNode.nextSibling) {
					return spanNode.nextSibling.nodeValue.trim().replace(/^:/, "").trim();
				}
				return null;
			};

			// Extrahieren basierend auf der Index-Reihenfolge
			if (spans.length >= 6) {
				info.device = getNextText(spans[0]);
				info.firmware = getNextText(spans[1]);
				info.status = getNextText(spans[2]);
				// spans[3] wird übersprungen
				info.dhcp_ip = getNextText(spans[4]);
				info.dhcp_subnet = getNextText(spans[5]);
			}
		}

		return { settings, info };
	}

	/**
	 * Read and cache settings and info from device homepage
	 * @returns {Promise<{settings: object, info: object}|null>}
	 */
	async readSettings() {
		try {
			await this.ensureAuth();
			const response = await this.client.get("/", { headers: this.getAuthHeaders() });
			const { settings, info } = this.parseSettingsAndInfoFromHtml(response.data);
			this.settings = settings;
			this.info = info;
			return { settings, info };
		} catch (error) {
			this.log("error", `Failed to read settings: ${error.message}`);
			return null;
		}
	}

	/**
	 * Write basic settings (led, pwr, dist)
	 * @param {{led?: number, pwr?: number, dist?: number}} settings
	 * @param {boolean} dryRun
	 */
	async writeSettings(settings = {}, dryRun = false) {
		try {
			await this.ensureAuth();
			if (dryRun) {
				this.log("debug", "writeSettings dry run");
				return true;
			}

			const params = new URLSearchParams();
			if (settings.led !== undefined) params.append("led", String(settings.led));
			if (settings.pwr !== undefined) params.append("pwr", String(settings.pwr));
			if (settings.dist !== undefined) params.append("dist", String(settings.dist));

			const response = await this.client.post("/settings", params.toString(), {
				headers: { "Content-Type": "application/x-www-form-urlencoded", ...this.getAuthHeaders() },
			});

			if (response.status === 200) {
				this.log("info", `Settings updated`);
				return true;
			}
			this.log("error", `Error writing settings: status ${response.status}`);
			return false;
		} catch (error) {
			this.log("error", `Failed to write settings: ${error.message}`);
			return false;
		}
	}

	/**
	 * Restart the device
	 * @param {boolean} dryRun
	 */
	async restart(dryRun = false) {
		try {
			await this.ensureAuth();
			if (dryRun) {
				this.log("debug", "restart dry run");
				return true;
			}
			const response = await this.client.post("/restart", {}, { headers: this.getAuthHeaders() });
			if (response.status === 200) {
				this.log("info", "Restart command sent successfully");
				return true;
			}
			this.log("error", `Restart failed with status ${response.status}`);
			return false;
		} catch (error) {
			this.log("error", `Failed to restart: ${error.message}`);
			return false;
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
