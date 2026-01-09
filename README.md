![Logo](admin/hailo-libero.png)
# ioBroker.hailo-libero

[![NPM version](https://img.shields.io/npm/v/iobroker.hailo-libero.svg)](https://www.npmjs.com/package/iobroker.hailo-libero)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hailo-libero.svg)](https://www.npmjs.com/package/iobroker.hailo-libero)
![Number of Installations](https://iobroker.live/badges/hailo-libero-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/hailo-libero-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.hailo-libero.png?downloads=true)](https://nodei.co/npm/iobroker.hailo-libero/)

**Tests:** ![Test and Release](https://github.com/jey-cee/ioBroker.hailo-libero/workflows/Test%20and%20Release/badge.svg)

## Hailo Libero adapter for ioBroker

Control your Hailo Libero 3.0 smart bin opening system from ioBroker.

### About Hailo Libero 3.0

The Hailo Libero 3.0 is an automatic, hands-free cabinet door opening system designed for waste bin cabinets. It uses a laser sensor to detect hand movement and automatically opens the cabinet door, providing a hygienic, touch-free solution for your kitchen.

This adapter allows you to integrate and control your Hailo Libero 3.0 device within ioBroker.
**Tested with firmware version 3.0.4**

## Features

- **Automatic device discovery and connection** via local network
- **Control cabinet door opening** remotely
- **LED brightness setting** (1-10)
- **Adjustable sensor distance** (31-100mm)
- **Adjustable ejection force** (1-10)
- **Device status monitoring** with configurable polling interval
- **Connection test** directly from admin interface
- **Automatic reconnection** if device becomes unavailable

## Installation

1. Install the adapter from the ioBroker admin interface
2. Configure the device IP address, port, and password in the adapter settings
3. Optionally adjust the polling interval for status updates

## Configuration

### Connection Settings

- **Device IP Address**: The IP address of your Hailo Libero device (default: `192.168.4.1` when connected to device's WiFi access point)
- **Port**: The port number for the web interface (default: `81`)
- **Password**: The device password (default: `hailo`)

### Polling Settings

- **Poll Interval**: How often to check device status in seconds (5-300 seconds, default: 30)

### Connection Test

Use the "Test Connection" button in the admin interface to verify that the adapter can reach your Hailo Libero device.

## Usage

### States

The adapter creates the following states:

#### Info
- `info.connection` - Connection status (boolean, read-only)
- `info.firmware` - Firmware version (string, read-only)
- `info.model` - Device model (string, read-only)

#### Control
- `control.open` - Open the bin lid (button, write-only)

#### Settings
- `settings.distance` - Sensor sensitivity 1-10 (number, read/write)
- `settings.ejectionForce` - Ejection force 1-10 (number, read/write)
- `settings.ledBrightness` - LED brightness 1-10 (number, read,write)

## Network Setup

The Hailo Libero 3.0 can be connected in two ways:

1. **Direct WiFi Connection**: Connect to the device's WiFi access point (Lib30_XXXXXX) and use IP `192.168.4.1`
2. **Local Network**: Configure the device to connect to your local WiFi network and use the assigned IP address

## Important Notes

- **API Reverse Engineering**: Since Hailo does not provide official API documentation, this adapter uses reverse-engineered endpoints from the device's web interface. Some features may require adjustment based on your specific device firmware version.
- **Network Connectivity**: Ensure your ioBroker host can reach the Hailo Libero device on your network
- **Firmware Compatibility**: This adapter is designed for Hailo Libero 3.0. Compatibility with other versions is not guaranteed.

## Troubleshooting

### Connection Issues
- Verify the device IP address and port in the adapter configuration
- Check that your ioBroker host can ping the device
- Ensure the device password is correct (default: `hailo`)
- Check your network firewall settings

### Device Not Responding
- The adapter will automatically attempt to reconnect every 60 seconds
- Try restarting the Hailo Libero device
- Verify the device's WiFi connection is active

## Disclaimer

This is an unofficial adapter developed through reverse-engineering of the Hailo Libero 3.0 web interface. It is not affiliated with, endorsed by, or supported by Hailo. The Hailo name and logo are trademarks of Hailo GmbH.

Use this adapter at your own risk. The author takes no responsibility for any damage to your device or system.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 1.0.0 (2026-01-09)
* (jey-cee) initial release

## License
MIT License

Copyright (c) 2026 jey-cee <iobroker@all-smart.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.