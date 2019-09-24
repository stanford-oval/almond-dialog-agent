// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Helpers = require('../helpers');
const DiscoveryDelegate = require('../dialogs/discovery_delegate');
const { ValueCategory } = require('../semantic');

const DialogStackFrame = require('./base');
const DeviceDiscoveryStackFrame = require('./discovery');

module.exports = class DeviceConfigStackFrame extends DialogStackFrame {
    constructor(dlg, kind) {
        super(dlg);
        this._kind = kind;
    }

    async _runFormConfiguration(factory) {
        let state = {
            kind: factory.kind
        };
        for (let field of factory.fields) {
            let cat;
            switch (field.type) {
            case 'password':
                cat = ValueCategory.Password;
                break;
            case 'number':
                cat = ValueCategory.Number;
                break;
            default:
                cat = ValueCategory.RawString;
            }
            let v = await this._dlg.ask(cat, this._dlg._("Please enter the %s.").format(field.label));
            state[field.name] = v.toJS();
        }

        this.complete(await this._manager.devices.addSerialized(state));

        // we're done here
        if (factory.category === 'online')
            await this._dlg.reply(this._dlg._("The account has been set up."));
        else if (factory.category === 'physical')
            await this._dlg.reply(this._dlg._("The device has been set up."));
        else
            await this._dlg.reply(this._dlg._("The service has been set up."));
    }

    async dispatch(intent) {
        if (this._manager.isAnonymous) {
            await this._dlg.reply(this._dlg._("Sorry, to enable %s, you must log in to your personal account.")
                .format(Helpers.cleanKind(this._kind)));
            await this._dlg.replyLink(this._dlg._("Register for Almond"), "/user/register");
            this.complete(null);
            return;
        }
        if (!this._manager.user.canConfigureDevice(this._kind)) {
            this._dlg.forbid();
            this.complete(null);
            return;
        }

        let factories = await this._manager.thingpedia.getDeviceSetup([this._kind]);
        let factory = factories[this._kind];
        if (!factory) {
            await this._dlg.reply(this._dlg._("I'm sorry, I can't find %s in my database.").format(Helpers.cleanKind(this._kind)));
            this.complete(null);
        } else if (factory.type === 'none') {
            this.complete(await this._manager.devices.addSerialized({ kind: factory.kind }));
            await this._dlg.reply(this._dlg._("%s has been enabled successfully.").format(factory.text));
        } else if (factory.type === 'multiple') {
            if (factory.choices.length > 0) {
                await this._dlg.reply(this._dlg._("Choose one of the following to configure %s.").format(Helpers.cleanKind(this._kind)));
                for (let choice of factory.choices) {
                    switch (choice.type) {
                    case 'oauth2':
                        await this._dlg.replyLink(this._dlg._("Configure %s").format(choice.text),
                                      '/devices/oauth2/%s?name=%s'.format(choice.kind, choice.text));
                        break;
                    default:
                        await this._dlg.replyButton(this._dlg._("Configure %s").format(choice.text), {
                            entities: {},
                            code: ['now', '=>', '@org.thingpedia.builtin.thingengine.builtin.configure', 'param:device:Entity(tt:device)', '=', 'device:' + choice.kind]
                        });
                    }
                }
            } else {
                await this._dlg.reply(this._dlg._("Sorry, I don't know how to configure %s.").format(Helpers.cleanKind(this._kind)));
            }
            this.complete(null);
        } else if (factory.type === 'interactive') {
            const delegate = new DiscoveryDelegate(this._dlg, factory.category);

            this.complete(await this._manager.devices.addInteractively(factory.kind, delegate));
        } else if (factory.type === 'discovery') {
            this.complete(await this._dlg.pushStackFrame(new DeviceDiscoveryStackFrame(this._dlg, factory.discoveryType, factory.kind, factory.text), null));
        } else if (factory.type === 'oauth2') {
            await this._dlg.reply(this._dlg._("OK, here's the link to configure %s.").format(factory.text));
            await this._dlg.replyLink(this._dlg._("Configure %s").format(factory.text),
                          '/devices/oauth2/%s?name=%s'.format(factory.kind, factory.text));
            this.complete(null);
        } else if (factory.type === 'form') {
            await this._runFormConfiguration(factory);
        } else {
            await this._dlg.reply(this._dlg._("I'm sorry, I don't know how to configure %s.").format(Helpers.cleanKind(this._kind)));
        }
        this.complete();
    }
};
