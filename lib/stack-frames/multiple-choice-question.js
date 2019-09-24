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

const { Intent, ValueCategory } = require('../semantic');
const DialogStackFrame = require('./base');

module.exports = class MultipleChoiceStackFrame extends DialogStackFrame {
    constructor(dlg, choices) {
        super(dlg);
        this._choices = choices;
    }

    get expecting() {
        return ValueCategory.MultipleChoice;
    }

    async onPush() {
        await super.onPush();
        await this._sendChoices();
    }

    async _sendChoices() {
        for (let i = 0; i < this._choices.length; i++)
            await this._dlg.replyChoice(i, 'choice', this._choices[i]);
    }

    compatible(command) {
        return command instanceof Intent.Answer;
    }

    async debug() {
        await this._dlg.reply("I'm asking a multiple choice question");
    }

    async help() {
        await this._dlg.reply(this._dlg._("Could you choose one of the following?"));
        await this._sendChoices();
        return true;
    }

    async dispatch(command) {
        // FIXME this code here is needed to avoid breaking a test, but arguably it's not the right thing to do...
        if (command.category !== ValueCategory.MultipleChoice) {
            await this._dlg.reply(this._dlg._("Sorry, but that's not what I asked."));
            await this.help();
            return;
        }

        let index = command.value;
        if (index !== Math.floor(index) ||
            index < 0 ||
            index > this._choices.length) {
            await this._dlg.reply(this._dlg._("Please click on one of the provided choices."));
            await this._sendChoices();
            return;
        }

        this.complete(command.value);
    }
};
