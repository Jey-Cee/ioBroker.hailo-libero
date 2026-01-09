"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const HailoClient = require("./lib/hailoClient");

class HailoLibero extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "hailo-libero",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		// Initialize variables
		this.client = null;
		this.pollInterval = null;
		this.reconnectTimeout = null;
		this.isConnected = false;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Validate configuration
		if (!this.config.deviceIp) {
			this.log.error("Device IP address is not configured. Please configure the adapter.");
			return;
		}

		this.log.info(
			`Initializing Hailo Libero adapter for device at ${this.config.deviceIp}:${this.config.devicePort}`,
		);

		// Create states for device control and monitoring
		await this.createStates();

		// Initialize Hailo client
		this.client = new HailoClient(
			this.config.deviceIp,
			this.config.devicePort || 81,
			this.config.password || "hailo",
			this.log,
		);

		// Subscribe to state changes
		this.subscribeStates("*");

		// Connect to device and start polling
		await this.connectToDevice();
	}

	/**
	 * Create all necessary states for the adapter
	 */
	async createStates() {
		// Connection state
		await this.setObjectNotExistsAsync("info.connection", {
			type: "state",
			common: {
				name: {
					en: "Device connection status",
					de: "Geräteverbindungsstatus",
					ru: "Статус подключения устройства",
					pt: "Status de conexão do dispositivo",
					nl: "Apparaat verbindingsstatus",
					fr: "État de connexion de l'appareil",
					it: "Stato connessione dispositivo",
					es: "Estado de conexión del dispositivo",
					pl: "Status połączenia urządzenia",
					uk: "Статус підключення пристрою",
					"zh-cn": "设备连接状态"
				},
				type: "boolean",
				role: "indicator.connected",
				read: true,
				write: false,
			},
			native: {},
		});

		// Control states
		await this.setObjectNotExistsAsync("control.open", {
			type: "state",
			common: {
				name: {
					en: "Open bin lid",
					de: "Deckel öffnen",
					ru: "Открыть крышку",
					pt: "Abrir tampa",
					nl: "Deksel openen",
					fr: "Ouvrir le couvercle",
					it: "Apri coperchio",
					es: "Abrir tapa",
					pl: "Otwórz pokrywę",
					uk: "Відкрити кришку",
					"zh-cn": "打开盖子"
				},
				type: "boolean",
				role: "button",
				read: false,
				write: true,
			},
			native: {},
		});

		// LED brightness
		await this.setObjectNotExistsAsync("settings.ledBrightness", {
			type: "state",
			common: {
				name: "LED brightness",
				type: "number",
				role: "level.dimmer",
				min: 1,
				max: 10,
				read: true,
				write: true,
			},
			native: {},
		});

		// Sensor distance
		await this.setObjectNotExistsAsync("settings.distance", {
			type: "state",
			common: {
				name: {
					en: "Sensor distance",
					de: "Sensorabstand",
					ru: "Расстояние датчика",
					pt: "Distância do sensor",
					nl: "Sensorafstand",
					fr: "Distance du capteur",
					it: "Distanza sensore",
					es: "Distancia del sensor",
					pl: "Odległość czujnika",
					uk: "Відстань датчика",
					"zh-cn": "传感器距离"
				},
				type: "number",
				role: "level",
				min: 31,
				max: 100,
				unit: "mm",
				read: true,
				write: true,
			},
			native: {},
		});

		// Ejection force
		await this.setObjectNotExistsAsync("settings.ejectionForce", {
			type: "state",
			common: {
				name: {
					en: "Ejection force",
					de: "Auswurfkraft",
					ru: "Сила выброса",
					pt: "Força de ejeção",
					nl: "Uitwerpkracht",
					fr: "Force d'éjection",
					it: "Forza di espulsione",
					es: "Fuerza de eyección",
					pl: "Siła wyrzutu",
					uk: "Сила викиду",
					"zh-cn": "弹出力"
				},
				type: "number",
				role: "level",
				min: 1,
				max: 10,
				read: true,
				write: true,
			},
			native: {},
		});

		// Device info states
		await this.setObjectNotExistsAsync("info.firmware", {
			type: "state",
			common: {
				name: {
					en: "Firmware version",
					de: "Firmware-Version",
					ru: "Версия прошивки",
					pt: "Versão do firmware",
					nl: "Firmwareversie",
					fr: "Version du firmware",
					it: "Versione firmware",
					es: "Versión de firmware",
					pl: "Wersja oprogramowania",
					uk: "Версія прошивки",
					"zh-cn": "固件版本"
				},
				type: "string",
				role: "info.firmware",
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync("info.model", {
			type: "state",
			common: {
				name: {
					en: "Device model",
					de: "Gerätemodell",
					ru: "Модель устройства",
					pt: "Modelo do dispositivo",
					nl: "Apparaatmodel",
					fr: "Modèle d'appareil",
					it: "Modello dispositivo",
					es: "Modelo del dispositivo",
					pl: "Model urządzenia",
					uk: "Модель пристрою",
					"zh-cn": "设备型号"
				},
				type: "string",
				role: "info.name",
				read: true,
				write: false,
			},
			native: {},
		});
	}

	/**
	 * Connect to the Hailo Libero device
	 */
	async connectToDevice() {
		try {
			this.log.info("Connecting to Hailo Libero device...");

			// Test connection first
			const testResult = await this.client.testConnection();
			if (!testResult.success) {
				this.log.error(`Cannot reach device at ${this.config.deviceIp}:${this.config.devicePort}`);
				await this.setState("info.connection", { val: false, ack: true });
				this.scheduleReconnect();
				return;
			}

			// Try to authenticate
			const authSuccess = await this.client.authenticate();
			if (!authSuccess) {
				this.log.warn("Authentication failed or not required. Continuing without authentication.");
			}

			this.isConnected = true;
			await this.setState("info.connection", { val: true, ack: true });
			this.log.info("Successfully connected to Hailo Libero device");

			// Get initial device info
			await this.updateDeviceInfo();

			// Get initial status
			await this.updateDeviceStatus();

			// Start polling
			this.startPolling();
		} catch (error) {
			this.log.error(`Error connecting to device: ${error.message}`);
			await this.setState("info.connection", { val: false, ack: true });
			this.scheduleReconnect();
		}
	}

	/**
	 * Update device information
	 */
	async updateDeviceInfo() {
		try {
			const deviceInfo = await this.client.getDeviceInfo();
			if (deviceInfo) {
				this.log.info("Found device info");
				if (deviceInfo.info.firmware) {
					this.log.info(`Device firmware version: ${deviceInfo.info.firmware}`);
					await this.setState("info.firmware", { val: deviceInfo.info.firmware, ack: true });
				}
				if (deviceInfo.info.device) {
					await this.setState("info.model", { val: deviceInfo.info.device, ack: true });
				}
			}
		} catch (error) {
			this.log.debug(`Could not get device info: ${error.message}`);
		}
	}

	/**
	 * Update device status
	 */
	async updateDeviceStatus() {
		try {
			const settings = await this.client.readSettings();
			if (settings) {
				if (settings.led !== undefined) {
					await this.setState("settings.ledBrightness", { val: settings.led.value, ack: true });
				}
				if (settings.dist !== undefined) {
					await this.setState("settings.distance", { val: settings.dist.value, ack: true });
				}
				if (settings.pwr !== undefined) {
					await this.setState("settings.ejectionForce", { val: settings.pwr.value, ack: true });
				}
			}
		} catch (error) {
			this.log.debug(`Could not get device status: ${error.message}`);
		}
	}

	/**
	 * Start polling for device status
	 */
	startPolling() {
		if (this.pollInterval) {
			this.clearInterval(this.pollInterval);
		}

		const interval = (this.config.pollInterval || 30) * 1000;

		this.pollInterval = this.setInterval(async () => {
			if (this.isConnected) {
				await this.updateDeviceStatus();
			}
		}, interval);
	}

	/**
	 * Schedule reconnection attempt
	 */
	scheduleReconnect() {
		if (this.reconnectTimeout) {
			this.clearTimeout(this.reconnectTimeout);
		}

		const reconnectDelay = 60000; // 1 minute
		this.log.info(`Scheduling reconnection attempt in ${reconnectDelay / 1000} seconds`);

		this.reconnectTimeout = this.setTimeout(async () => {
			await this.connectToDevice();
		}, reconnectDelay);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("Cleaning up and shutting down adapter...");

			// Clear polling interval
			if (this.pollInterval) {
				this.clearInterval(this.pollInterval);
				this.pollInterval = null;
			}

			// Clear reconnect timeout
			if (this.reconnectTimeout) {
				this.clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}

			// Set connection state to false
			this.setState("info.connection", { val: false, ack: true })
				.then(() => {
					callback();
				})
				.catch(() => {
					callback();
				});
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (!state || state.ack) {
			// Ignore acknowledged states or deleted states
			return;
		}

		// Only handle command states (ack=false)
		const idParts = id.split(".");
		const stateName = idParts.slice(2).join(".");

		try {
			switch (stateName) {
				case "control.open":
					if (state.val) {
						this.log.debug("Opening bin lid...");
						const success = await this.client.openLid();
						if (success) {
							this.log.debug("Bin lid opened successfully");
							// Reset button state
							await this.setState("control.open", { val: false, ack: true });
						} else {
							this.log.error("Failed to open bin lid");
						}
					}
					break;

				case "settings.ledBrightness":
				case "settings.ejectionForce":
				case "settings.distance": {
					if (!this.client) {
						this.log.error("Client is not initialized");
						return;
					}

					// Hole alle aktuellen Werte
					const ledState = await this.getStateAsync("settings.ledBrightness");
					const forceState = await this.getStateAsync("settings.ejectionForce");
					const distanceState = await this.getStateAsync("settings.distance");

					// Bestimme welcher Wert geändert wurde und verwende die aktuellen Werte für die anderen
					const ledValue = stateName === "settings.ledBrightness" ? Number(state.val) : (ledState?.val ? Number(ledState.val) : 5);
					const forceValue = stateName === "settings.ejectionForce" ? Number(state.val) : (forceState?.val ? Number(forceState.val) : 5);
					const distanceValue = stateName === "settings.distance" ? Number(state.val) : (distanceState?.val ? Number(distanceState.val) : 50);

					const success = await this.client.writeSettings({
						led: ledValue,
						pwr: forceValue,
						dist: distanceValue
					});

					if (success) {
						// Bestätige alle drei Werte
						await this.setState("settings.ledBrightness", { val: ledValue, ack: true });
						await this.setState("settings.ejectionForce", { val: forceValue, ack: true });
						await this.setState("settings.distance", { val: distanceValue, ack: true });
						this.log.debug("All settings updated successfully");
					} else {
						this.log.error("Failed to update settings");
					}
					break;
				}

				default:
					this.log.debug(`Unhandled state change: ${stateName}`);
			}
		} catch (error) {
			this.log.error(`Error handling state change for ${stateName}: ${error.message}`);
		}
	}

	/**
	 * Some message was sent to this instance over message box.
	 * @param {ioBroker.Message} obj
	 */
	async onMessage(obj) {
		if (typeof obj === "object" && obj.message) {
			switch (obj.command) {
				case "testConnection":
					try {
						const { ip, port, password } = obj.message;

						if (!ip) {
							this.sendTo(obj.from, obj.command, { error: "IP address is required" }, obj.callback);
							return;
						}

						// Create temporary client for testing
						const testClient = new HailoClient(ip, port || 81, password || "hailo", this.log);
						const result = await testClient.testConnection();

						if (result.success) {
							this.sendTo(
								obj.from,
								obj.command,
								{
									result: "Connection successful!",
									success: true,
								},
								obj.callback,
							);
						} else {
							this.sendTo(
								obj.from,
								obj.command,
								{
									error: `Connection failed: ${result.message}`,
									success: false,
								},
								obj.callback,
							);
						}
					} catch (error) {
						this.sendTo(
							obj.from,
							obj.command,
							{
								error: `Connection test failed: ${error.message}`,
								success: false,
							},
							obj.callback,
						);
					}
					break;

				default:
					this.log.warn(`Unknown command: ${obj.command}`);
					if (obj.callback) {
						this.sendTo(obj.from, obj.command, { error: "Unknown command" }, obj.callback);
					}
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new HailoLibero(options);
} else {
	// otherwise start the instance directly
	new HailoLibero();
}
