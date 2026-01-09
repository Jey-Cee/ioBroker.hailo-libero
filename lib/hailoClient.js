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

			// Send form-encoded pin - no redirect expected, just 200 OK with Set-Cookie
			const params = new URLSearchParams();
			params.append("pin", this.password);
			params.append("submit", "");

			const response = await this.client.post("/login", params.toString(), {
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					...(this.sessionCookie ? { Cookie: this.sessionCookie } : {})
				},
				maxRedirects: 0,
				validateStatus: (status) => status >= 200 && status < 400,
			});

			// Check if authentication was successful (status 200 or 301)
			if (response.status === 200 || response.status === 301) {
				// Extract cookie from Set-Cookie header
				const setCookieHeader = response.headers["set-cookie"];
				if (setCookieHeader) {
					const cookieMatch = Array.isArray(setCookieHeader)
						? setCookieHeader[0].match(/^c=([^;]+)/)
						: setCookieHeader.match(/^c=([^;]+)/);

					if (cookieMatch) {
						this.sessionCookie = `c=${cookieMatch[1]}`;
						this.authenticated = true;
						this.log("info", "Successfully authenticated with Hailo Libero device");
						return true;
					}
				}
			}

			this.log("warn", `Authentication failed - no valid session cookie received (status: ${response.status})`);
			this.authenticated = false;
			return false;

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

		return this.parseSettingsAndInfoFromHtml(htmlString);
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
					max: parseInt(input.attr("max"), 10),
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
		// Suche das <p> Element, das die Spans mit IDs t5-t10 enthält (Systeminfo-Bereich)
		const systemInfoP = $("span#t5").parent("p");

		if (systemInfoP.length > 0) {
			// Helper-Funktion: Extrahiert den Text nach dem <span> bis zum nächsten <br> oder <span>
			const getValueAfterSpan = (spanId) => {
				const span = $(`span#${spanId}`);
				if (span.length === 0) return null;

				// Text direkt nach dem Span bis zum nächsten Element
				const nextNode = span[0].nextSibling;
				if (nextNode && nextNode.type === "text") {
					// Entferne führenden Doppelpunkt und Whitespace
					return nextNode.data.replace(/^:\s*/, "").trim();
				}
				return null;
			};

			info.device = getValueAfterSpan("t5");     // Gerät: Libero30_25266A
			info.firmware = getValueAfterSpan("t6");   // SW Version: 3.0.4
			info.status = getValueAfterSpan("t7");     // Status: Ready
			info.ssid = getValueAfterSpan("t8");       // STA-SSID: Eriks-Home
			info.dhcp_ip = getValueAfterSpan("t9");    // STA-IP: 192.168.10.25
			info.dhcp_subnet = getValueAfterSpan("t10"); // STA-Subnet Mask: 255.255.255.0
		}

		return { settings, info };
	}

	/**
	 * Read and cache settings and info from device homepage
	 * @returns {Promise<{settings: object}|null>}
	 */
	async readSettings() {
		try {
			await this.ensureAuth();
			const response = await this.client.get("/", { headers: this.getAuthHeaders() });
			const { settings } = this.parseSettingsAndInfoFromHtml(response.data);
			this.settings = settings;
			return settings;
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
}

module.exports = HailoClient;
