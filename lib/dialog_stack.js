// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Semantic = require('./semantic');
const ValueCategory = Semantic.ValueCategory;

const AcceptResult = {
    INCOMPATIBLE: -1,
    COMPATIBLE: 0,
    HANDLED: 1,
};

class CancellationError extends Error {
    constructor(msg, intent) {
        super(msg);
        this.code = 'ECANCELLED';
        this.intent = intent;
    }
}

function categoryEquals(a, b) {
    if ((a === null) !== (b === null))
        return false;
    return a.equals(b);
}

class DialogStackFrame {
    constructor(dlg) {
        this._manager = dlg.manager;
        this._dlg = dlg;
    }

    async onPush() {
        this._manager.expect(this.expecting);
    }
    async onPop() {}

    /**
      Returns the rough category of what the stack frame expects.

      This is used for the ask special commands, which in turn control
      the layout of the virtual keyboard on Android and the presence
      of file/contact/location pickers.
    */
    get expecting() {
        // by default, we expect "something", but we're not quite sure what
        return 'generic';
    }

    /**
      Check if the command can be handled at this stack level.

      If accept() returns AcceptResult.INCOMPATIBLE, the stack
      will be popped and the command will be retried in the new stack.
      If accept() returns AcceptResult.COMPATIBLE, the stack
      is unchanged and the command is dispatched to the dialog thread.
      If accept() returns AcceptResult.HANDLED, the command is assumed
      handled and no further processing occurs.
    */
    async accept(command) {
        if (command.isFailed) {
            // don't handle this if we're not expecting anything
            // (it will fall through to whatever dialog.handle()
            // is doing, which is calling FallbackDialog for DefaultDialog,
            // actually showing the fallback for FallbackDialog,
            // and doing nothing for all other dialogs)
            return AcceptResult.INCOMPATIBLE;
        }
        if (command.isTrain)
            return AcceptResult.INCOMPATIBLE;
        if (command.isDebug) {
            await this._dlg.reply("I'm not in the default state");
            if (this.expecting === null)
                await this._dlg.reply("I'm not expecting anything");
            else
                await this._dlg.reply("I'm expecting a " + this.expecting);
            //for (var key of this.manager.stats.keys())
            //    await this.reply(key + ": " + this.manager.stats.get(key));
            return AcceptResult.HANDLED;
        }
        if (command.isHelp) // by default, help pops the stack and starts a make rule
            return AcceptResult.INCOMPATIBLE;
        if (command.isWakeUp) // nothing to do
            return AcceptResult.HANDLED;

        // stop means cancel, but without a failure message
        // never mind means cancel, but with a failure message
        //
        // both will pop all the way up, and TopLevelStackFrame will show the message
        if (command.isStop || command.isNeverMind)
            return AcceptResult.INCOMPATIBLE;

        // by default, we treat "no" as cancel - QuestionStackFrame overrides if necessary
        if (command.isNo)
            return AcceptResult.INCOMPATIBLE;

        // by default, everything else is compatible, and the dialog logic will
        // decide what do to
        return AcceptResult.COMPATIBLE;
    }
}

class TopLevelStackFrame extends DialogStackFrame {
    get expecting() {
        // at the top-level we don't expect anything (the interaction is complete)
        return null;
    }

    async accept(command) {
        if (command.isDebug) {
            await this._dlg.reply("I'm in the default state");
            return AcceptResult.HANDLED;
        }

        const accepted = await super.accept(command);
        if (accepted === AcceptResult.HANDLED || accepted === AcceptResult.COMPATIBLE)
            return accepted;

        // if we popped the stack due to a never mind, show a failure message
        if (command.isNeverMind)
            await this._dlg.reset();
        // if we popped the stack due to a cancellation, we don't need to dispatch the message,
        // but we need to reset the context
        if (command.isNeverMind || command.isStop) {
            this._dlg.setContext(null);
            return AcceptResult.HANDLED;
        }

        // in all the other cases, the command is compatible with the current stack
        // frame, because there is no other stack frame to pop
        return AcceptResult.COMPATIBLE;
    }
}

class ResultStackFrame extends DialogStackFrame {
    get expecting() {
        return ValueCategory.MORE;
    }

    async accept(command) {
        const accepted = await super.accept(command);
        if (accepted === AcceptResult.HANDLED)
            return accepted;

        // if the user clicks more, more we let the intent through to rule.js
        if (command.isMore)
            return AcceptResult.COMPATIBLE;

        // otherwise, we pop the stack quietly
        return AcceptResult.INCOMPATIBLE;
    }
}

class QuestionStackFrame extends DialogStackFrame {
    constructor(dlg, expecting) {
        super(dlg);
        assert(expecting !== null);
        this._expecting = expecting;
    }

    get expecting() {
        return this._expecting;
    }

    async _lookingFor() {
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

    async accept(command) {
        if (command.isFailed) {
            await this._dlg.reply(this._dlg._("Sorry, I did not understand that."));
            await this._lookingFor();
            return AcceptResult.HANDLED;
        }
        if (command.isHelp) {
            await this._lookingFor();
            return AcceptResult.HANDLED;
        }
        if (command.isAnswer && categoryEquals(command.category, this._expecting))
            return AcceptResult.COMPATIBLE;

        if (this._expecting === ValueCategory.Password &&
            command.isAnswer && command.category === ValueCategory.RawString)
            return AcceptResult.COMPATIBLE;

        if (this._expecting === ValueCategory.Command &&
            (command.isProgram || command.isCommandList || command.isBack || command.isMore || command.isEmpty))
            return AcceptResult.COMPATIBLE;
        if (this._expecting === ValueCategory.Predicate &&
            (command.isPredicate || command.isBack || command.isMore))
            return AcceptResult.COMPATIBLE;
        if (this._expecting === ValueCategory.PermissionResponse &&
            (command.isPredicate || command.isPermissionRule || command.isMore || command.isYes || command.isMaybe || command.isBack))
            return AcceptResult.COMPATIBLE;

        // if given an answer when we don't expect one have Almond complain
        if (command.isYes) {
            await this._dlg.reply(this._dlg._("Yes what?"));
            return AcceptResult.HANDLED;
        }
        if (command.isNo) {
            await this._dlg.reset();
            return AcceptResult.INCOMPATIBLE;
        }
        if (command.isAnswer) {
            this._manager.stats.hit('sabrina-unexpected');
            await this._dlg.reply(this._dlg._("Sorry, but that's not what I asked."));
            await this._lookingFor();
            return AcceptResult.HANDLED;
        }

        const accepted = await super.accept(command);
        if (accepted === AcceptResult.HANDLED)
            return accepted;

        // anything else, pop the stack
        return AcceptResult.INCOMPATIBLE;
    }
}

class MultipleChoiceStackFrame extends QuestionStackFrame {
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
}

/*
module.exports = class DialogStack {
    constructor(dlg) {
        this._dlg = dlg;
        this._store = [new TopLevelStackFrame(dlg)];
    }

    get _top() {
        return this._store[this._length-1];
    }

    get expecting() {
        return this._top.expecting;
    }

    async _pop() {
        const frame = this._store.pop();
        // we must never pop the top-level frame
        assert(this._store.length > 0);
        await frame.onPop();
        return frame;
    }

    async push(expecting) {
        const frame = expecting !== 'generic' ? new QuestionStackFrame(this._dlg, expecting) :
            new DialogStackFrame(this._dlg);
        this._store.push(frame);
        await frame.onPush();
        return frame;
    }
};
*/
module.exports = {
    AcceptResult,
    CancellationError,

    DialogStackFrame,
    QuestionStackFrame,
    MultipleChoiceStackFrame,
    ResultStackFrame,
    TopLevelStackFrame
};
