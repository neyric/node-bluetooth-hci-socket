var events = require('events');
var util = require('util');

var debug = require('debug')('bluetooth-hci-socket-usb');
var usb = require('usb');

var HCI_COMMAND_PKT = 0x01;
var HCI_ACLDATA_PKT = 0x02;
var HCI_EVENT_PKT = 0x04;

function BluetoothHciSocket() {
  this._hciEventEndpointBuffer = new Buffer(0);
}

util.inherits(BluetoothHciSocket, events.EventEmitter);

BluetoothHciSocket.prototype.setFilter = function(filter) {
  // no-op
};

BluetoothHciSocket.prototype.bindRaw = function(devId) {
  this._mode = 'raw';

  this._usbDevice = usb.findByIds(0x0a5c, 0x21e8) || usb.findByIds(0x0a12, 0x0001);

  this._usbDevice.open();

  this._usbDeviceInterface = this._usbDevice.interfaces[0];

  this._aclDataOutEndpoint = this._usbDeviceInterface.endpoint(0x02);

  this._hciEventEndpoint = this._usbDeviceInterface.endpoint(0x81);
  this._aclDataInEndpoint = this._usbDeviceInterface.endpoint(0x82);

  this._usbDeviceInterface.claim();
};

BluetoothHciSocket.prototype.bindControl = function() {
  this._mode = 'control';
};

BluetoothHciSocket.prototype.isDevUp = function() {
  return true;
};

BluetoothHciSocket.prototype.start = function() {
  if (this._mode === 'raw') {
    this._hciEventEndpoint.on('data', this.onHciEventEndpointData.bind(this));
    this._hciEventEndpoint.startPoll();

    this._aclDataInEndpoint.on('data', this.onAclDataInEndpointData.bind(this));
    this._aclDataInEndpoint.startPoll();
  }
};

BluetoothHciSocket.prototype.stop = function() {
  if (this._mode === 'raw') {
    this._hciEventEndpoint.stopPoll();
    this._hciEventEndpoint.removeAllListeners();

    this._aclDataInEndpoint.stopPoll();
    this._aclDataInEndpoint.removeAllListeners();
  }
};

BluetoothHciSocket.prototype.write = function(data) {
  debug('write: ' + data.toString('hex'));

  if (this._mode === 'raw') {
    var type = data.readUInt8(0);

    if (HCI_COMMAND_PKT === type) {
      this._usbDevice.controlTransfer(usb.LIBUSB_REQUEST_TYPE_CLASS | usb.LIBUSB_RECIPIENT_INTERFACE, 0, 0, 0, data.slice(1));
    } else if(HCI_ACLDATA_PKT === type) {
      this._aclDataOutEndpoint.transfer(data.slice(1));
    }
  }
};

BluetoothHciSocket.prototype.onHciEventEndpointData = function(data) {
  debug('HCI event: ' + data.toString('hex'));

  // add to buffer
  this._hciEventEndpointBuffer = Buffer.concat([
    this._hciEventEndpointBuffer,
    data
  ]);

  // check if desired length
  if (this._hciEventEndpointBuffer.readUInt8(1) === (this._hciEventEndpointBuffer.length - 2)) {
    // fire event
    this.emit('data', Buffer.concat([
      new Buffer([HCI_EVENT_PKT]),
      this._hciEventEndpointBuffer
    ]));

    // reset buffer
    this._hciEventEndpointBuffer = new Buffer(0);
  }
};

BluetoothHciSocket.prototype.onAclDataInEndpointData = function(data) {
  debug('ACL Data In: ' + data.toString('hex'));

  this.emit('data', Buffer.concat([
    new Buffer([HCI_ACLDATA_PKT]),
    data
  ]));
};

module.exports = BluetoothHciSocket;
