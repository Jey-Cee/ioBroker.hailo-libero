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

		this.log.info(`Initializing Hailo Libero adapter for device at ${this.config.deviceIp}:${this.config.devicePort}`);

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
				name: "Device connection status",
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
				name: "Open bin lid",
				type: "boolean",
				role: "button",
				read: false,
				write: true,
			},
			native: {},
		});

		// LED control
		await this.setObjectNotExistsAsync("control.led", {
			type: "state",
			common: {
				name: "LED lighting",
				type: "boolean",
				role: "switch",
				read: true,
				write: true,
			},
			native: {},
		});

		// Sensor sensitivity
		await this.setObjectNotExistsAsync("settings.sensitivity", {
			type: "state",
			common: {
				name: "Sensor sensitivity",
				type: "number",
				role: "level",
				min: 0,
				max: 100,
				unit: "%",
				read: true,
				write: true,
			},
			native: {},
		});

		// Ejection force
		await this.setObjectNotExistsAsync("settings.ejectionForce", {
			type: "state",
			common: {
				name: "Ejection force",
				type: "number",
				role: "level",
				min: 0,
				max: 100,
				unit: "%",
				read: true,
				write: true,
			},
			native: {},
		});

		// Device info states
		await this.setObjectNotExistsAsync("info.firmware", {
			type: "state",
			common: {
				name: "Firmware version",
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
				name: "Device model",
				type: "string",
				role: "info.name",
				read: true,
				write: false,
			},
			native: {},
		});

		// Status information
		await this.setObjectNotExistsAsync("status.lastUpdate", {
			type: "state",
			common: {
				name: "Last status update",
				type: "number",
				role: "value.time",
				read: true,
				write: false,
			},
			native: {},
		});

		this.log.debug("All states created successfully");
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
			const info = await this.client.getDeviceInfo();
			if (info) {
				if (info.firmware) {
					await this.setState("info.firmware", { val: info.firmware, ack: true });
				}
				if (info.model) {
					await this.setState("info.model", { val: info.model, ack: true });
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
			const status = await this.client.getStatus();
			if (status) {
				// Update states based on status response
				if (status.led !== undefined) {
					await this.setState("control.led", { val: status.led, ack: true });
				}
				if (status.sensitivity !== undefined) {
					await this.setState("settings.sensitivity", { val: status.sensitivity, ack: true });
				}
				if (status.ejectionForce !== undefined) {
					await this.setState("settings.ejectionForce", { val: status.ejectionForce, ack: true });
				}

				await this.setState("status.lastUpdate", { val: Date.now(), ack: true });
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
		this.log.debug(`Starting polling with interval ${interval}ms`);

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

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

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

		this.log.debug(`State change: ${stateName} = ${state.val}`);

		try {
			switch (stateName) {
				case "control.open":
					if (state.val) {
						this.log.info("Opening bin lid...");
						const success = await this.client.openLid();
						if (success) {
							this.log.info("Bin lid opened successfully");
							// Reset button state
							await this.setState("control.open", { val: false, ack: true });
						} else {
							this.log.error("Failed to open bin lid");
						}
					}
					break;

				case "control.led":
					this.log.info(`Setting LED to ${state.val ? "on" : "off"}`);
					const ledSuccess = await this.client.setLED(state.val);
					if (ledSuccess) {
						await this.setState("control.led", { val: state.val, ack: true });
					} else {
						this.log.error("Failed to set LED state");
					}
					break;

				case "settings.sensitivity":
					this.log.info(`Setting sensor sensitivity to ${state.val}%`);
					const sensSuccess = await this.client.setSensitivity(state.val);
					if (sensSuccess) {
						await this.setState("settings.sensitivity", { val: state.val, ack: true });
					} else {
						this.log.error("Failed to set sensitivity");
					}
					break;

				case "settings.ejectionForce":
					this.log.info(`Setting ejection force to ${state.val}%`);
					const forceSuccess = await this.client.setEjectionForce(state.val);
					if (forceSuccess) {
						await this.setState("settings.ejectionForce", { val: state.val, ack: true });
					} else {
						this.log.error("Failed to set ejection force");
					}
					break;

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
