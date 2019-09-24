// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { ValueCategory } = require('../semantic');
const DialogStackFrame = require('./base');

const DiscoveryDelegate = require('../dialogs/discovery_delegate');
const DISCOVERY_TIMEOUT = 20000;

module.exports = class DeviceDiscoveryStackFrame extends DialogStackFrame {
    constructor(dlg, discoveryProtocol, discoveryKind, discoveryName) {
        super(dlg);
        this._discoveryProtocol = discoveryProtocol;
        this._discoveryKind = discoveryKind;
        this._discoveryName = discoveryName;
    }

    async _completeDiscovery(device, deviceClass = 'physical') {
        const delegate = new DiscoveryDelegate(this._dlg, deviceClass);

        try {
            await this._manager.devices.completeDiscovery(device, delegate);
        } catch (e) {
            if (e.code === 'ECANCELLED')
                throw e;
            console.error('Failed to complete device configuration from discovery: ' + e.message);
        }
    }

    async dispatch(intent) {
        this._dlg.manager.stats.hit('sabrina-command-rule');

        // discovery will be null for cloud
        if (this._manager.discovery === null) {
            await this._dlg.reply(this._dlg._("Discovery is not available in this installation of Almond."));
            this.complete(null);
            return;
        }
        if (this._manager.isAnonymous) {
            await this._dlg.reply(this._dlg._("Sorry, to discover new devices you must log in to your personal account."));
            await this._dlg.replyLink(this._dlg._("Register for Almond"), "/user/register");
            this.complete(null);
            return;
        }
        if (!this._dlg.manager.user.canConfigureDevice(null)) {
            this._dlg.forbid();
            this.complete(null);
            return;
        }

        let devices;
        try {
            if (this._discoveryName !== undefined)
                await this._dlg.reply(this._dlg._("Searching for %s…").format(this._discoveryName));
            else
                await this._dlg.reply(this._dlg._("Searching for devices nearby…"));

            devices = await this._manager.discovery.runDiscovery(DISCOVERY_TIMEOUT, this._discoveryProtocol);
            if (devices === null) {
                this.complete(null);
                return;
            }
        } catch(e) {
            this._manager.discovery.stopDiscovery().catch((e) => {
                console.error('Failed to stop discovery: ' + e.message);
            });
            if (e.code === 'ECANCELLED')
                throw e;
            await this._dlg.reply(this._dlg._("Discovery failed: %s").format(e.message));
            this.complete(null);
            return;
        }

        if (this._discoveryKind !== undefined)
            devices = devices.filter((d) => d.hasKind(this._discoveryKind));
        if (devices.length === 0) {
            if (this._discoveryName !== undefined)
                await this._dlg.reply(this._dlg._("Can't find any %s around.").format(this._discoveryName));
            else
                await this._dlg.reply(this._dlg._("Can't find any device around."));
            this.complete(null);
            return;
        }

        if (devices.length === 1) {
            let device = devices[0];
            let answer = await this._dlg.ask(ValueCategory.YesNo, this._dlg._("I found a %s. Do you want to set it up now?").format(device.name));
            if (answer) {
                this._manager.stats.hit('sabrina-confirm');
                await this._completeDiscovery(device);
                this.complete(device);
            } else {
                this._dlg.reset();
                this.complete(null);
            }
        } else {
            let idx = await this._dlg.askChoices(this._dlg._("I found the following devices. Which one do you want to set up?"),
                devices.map((d) => d.name));
            this._manager.stats.hit('sabrina-confirm');
            let device = devices[idx];
            await this._completeDiscovery(device);
            this.complete(device);
        }
    }
};
