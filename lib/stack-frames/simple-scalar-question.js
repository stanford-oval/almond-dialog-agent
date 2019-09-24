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

const { Intent, ValueCategory } = require('../semantic');
const DialogStackFrame = require('./base');

function categoryEquals(a, b) {
    if ((a === null) !== (b === null))
        return false;
    return a.equals(b);
}

module.exports = class SimpleScalarQuestionStackFrame extends DialogStackFrame {
    constructor(dlg, expecting) {
        super(dlg);
        assert(expecting !== null);
        this._expecting = expecting;
    }

    get expecting() {
        return this._expecting;
    }

    async help() {
        // FIXME move to ThingTalk
        const ALLOWED_MEASURES = {
            'ms': this._dlg._("a time interval"),
            'm': this._dlg._("a length"),
            'mps': this._dlg._("a speed"),
            'kg': this._dlg._("a weight"),
            'Pa': this._dlg._("a pressure"),
            'C': this._dlg._("a temperature"),
            'kcal': this._dlg._("an energy"),
            'byte': this._dlg._("a size")
        };
        const ALLOWED_UNITS = {
            'ms': ['ms', 's', 'min', 'h', 'day', 'week', 'mon', 'year'],
            'm': ['m', 'km', 'mm', 'cm', 'mi', 'in'],
            'mps': ['mps', 'kmph', 'mph'],
            'kg': ['kg', 'g', 'lb', 'oz'],
            'Pa': ['Pa', 'bar', 'psi', 'mmHg', 'inHg', 'atm'],
            'C': ['C', 'F', 'K'],
            'kcal': ['kcal', 'kJ'],
            'byte': ['byte', 'KB', 'KiB', 'MB', 'MiB', 'GB', 'GiB', 'TB', 'TiB']
        };

        if (this.expecting === ValueCategory.YesNo) {
            await this._dlg.reply(this._dlg._("Sorry, I need you to confirm the last question first."));
        } else if (this.expecting.isMeasure) {
            await this._dlg.reply(this._dlg._("I'm looking for %s in any of the supported units (%s).")
                .format(ALLOWED_MEASURES[this.expecting.unit], ALLOWED_UNITS[this.expecting.unit].join(', ')));
        } else if (this.expecting === ValueCategory.Number) {
            await this._dlg.reply(this._dlg._("Could you give me a number?"));
        } else if (this.expecting === ValueCategory.Date) {
            await this._dlg.reply(this._dlg._("Could you give me a date?"));
        } else if (this.expecting === ValueCategory.Time) {
            await this._dlg.reply(this._dlg._("Could you give me a time of day?"));
        } else if (this.expecting === ValueCategory.Picture) {
            await this._dlg.reply(this._dlg._("Could you upload a picture?"));
        } else if (this.expecting === ValueCategory.Location) {
            await this._dlg.reply(this._dlg._("Could you give me a place?"));
        } else if (this.expecting === ValueCategory.PhoneNumber) {
            await this._dlg.reply(this._dlg._("Could you give me a phone number?"));
        } else if (this.expecting === ValueCategory.EmailAddress) {
            await this._dlg.reply(this._dlg._("Could you give me an email address?"));
        } else if (this.expecting === ValueCategory.RawString || this.expecting === ValueCategory.Password) {
            // ValueCategory.RawString puts Almond in raw mode,
            // so we accept almost everything
            // but this will happen if the user clicks a button
            // or upload a picture
            await this._dlg.reply(this._dlg._("Which is interesting, because I'll take anything at all. Just type your mind!"));
        } else if (this.expecting === ValueCategory.Command) {
            await this._dlg.reply(this._dlg._("I'm looking for a command."));
        } else if (this.expecting === ValueCategory.Predicate) {
            await this._dlg.reply(this._dlg._("I'm looking for a filter"));
        } else {
            await this._dlg.reply(this._dlg._("In fact, I'm not even sure what I asked. Sorry!"));
        }
    }

    compatible(command) {
        return command instanceof Intent.Answer;
    }

    async validateAnswer(command) {
        // check that the command has the correct type, otherwise we show an error

        if (categoryEquals(command.category, this._expecting))
            return true;

        if (this._expecting === ValueCategory.Password &&
            command.category === ValueCategory.RawString)
            return true;

        if (command.isYes) {
            await this._dlg.reply(this._dlg._("Yes what?"));
            return false;
        }
        if (command.isNo) {
            await this._dlg.reply(this._dlg._("No what?"));
            return false;
        }

        this._manager.stats.hit('sabrina-unexpected');
        await this._dlg.reply(this._dlg._("Sorry, but that's not what I asked."));
        await this.help();
        return false;
    }
};
