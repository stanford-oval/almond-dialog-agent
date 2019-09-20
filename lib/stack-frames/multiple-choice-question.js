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

const assert = require('assert');

const { ValueCategory } = require('../semantic');
const { AcceptResult } = require('./base');
const QuestionStackFrame = require('./simple-scalar-question');

module.exports = class MultipleChoiceStackFrame extends QuestionStackFrame {
    constructor(dlg, choices) {
        super(dlg, ValueCategory.MultipleChoice);
        this._choices = choices;
    }

    async onPush() {
        await super.onPush();
        await this._sendChoices();
    }

    async _sendChoices() {
        for (let i = 0; i < this._choices.length; i++)
            await this._dlg.replyChoice(i, 'choice', this._choices[i]);
    }

    async _lookingFor() {
        await this._dlg.reply(this._dlg._("Could you choose one of the following?"));
        await this._sendChoices();
    }

    async accept(command) {
        const accepted = await super.accept(command);
        if (accepted !== AcceptResult.COMPATIBLE)
            return accepted;

        assert(command.isAnswer && command.category === ValueCategory.MultipleChoice);
        let index = command.value;
        if (index !== Math.floor(index) ||
            index < 0 ||
            index > this._choices.length) {
            await this._dlg.reply(this._dlg._("Please click on one of the provided choices."));
            await this._sendChoices();
            return AcceptResult.HANDLED;
        }
        return AcceptResult.COMPATIBLE;
    }
};
