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

const AcceptResult = {
    INCOMPATIBLE: -1,
    COMPATIBLE: 0,
    HANDLED: 1,
};

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

module.exports = {
    DialogStackFrame,
    AcceptResult
};
