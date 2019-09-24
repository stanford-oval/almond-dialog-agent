// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Helpers = require('../helpers');
const { Intent } = require('../semantic');

const DialogStackFrame = require('./base');
const ProgramStackFrame = require('./program');
const PermissionRuleStackFrame = require('./permission-rule');
const MakeDialogStackFrame = require('./make-dialog');
const TrainStackFrame = require('./train');

module.exports = class TopLevelStackFrame extends DialogStackFrame {
    get expecting() {
        // at the top-level we don't expect anything (the interaction is complete)
        return null;
    }

    async debug() {
        await this._dlg.reply("I'm in the default state");
        await this._dlg.reply("I'm not expecting anything");
    }

    compatible(command) {
        // everything is compatible at the top
        return true;
    }

    async dispatch(intent) {
        if (intent instanceof Intent.Stop) {
            this._dlg.setContext(null);
        } else if (intent instanceof Intent.NeverMind) {
            await this._dlg.reset();
            this._dlg.setContext(null);
        } else if (intent instanceof Intent.Train) {
            await this._dlg.pushStackFrame(new TrainStackFrame(this._dlg), intent);
        } else if (intent instanceof Intent.Yes) {
            this._dlg.manager.stats.hit('sabrina-command-egg');
            await this._dlg.reply(this._dlg._("I agree, but to what?"));
        } else if (intent instanceof Intent.No) {
            this._dlg.manager.stats.hit('sabrina-command-egg');
            await this._dlg.reply(this._dlg._("No way!"));
        } else if (intent instanceof Intent.Example) {
            await Helpers.presentSingleExample(this._dlg, intent.utterance, intent.targetCode);
        } else if (intent instanceof Intent.Program) {
            await this._dlg.pushStackFrame(new ProgramStackFrame(this._dlg), intent);
        } else if (intent instanceof Intent.Help || intent instanceof Intent.Make) {
            this._dlg.manager.stats.hit('sabrina-command-make');
            await this._dlg.pushStackFrame(new MakeDialogStackFrame(this._dlg), intent);
        } else if (intent instanceof Intent.PermissionRule) {
            this._dlg.manager.stats.hit('sabrina-command-permissionrule');
            await this._dlg.pushStackFrame(new PermissionRuleStackFrame(this._dlg), intent);
        } else {
            this._dlg.fail();
        }
        this.complete();
    }
};
