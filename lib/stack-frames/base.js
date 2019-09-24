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

module.exports = class DialogStackFrame {
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

      If true, the command will be dispatched. If false, the frame will be popped
      and the command redispatched.
    */
    compatible(command) {
        // by default, nothing is compatible, and we always pop
        return false;
    }

    /**
      Display debug messages for this stack frame.
    */
    async debug() {
        await this._dlg.reply("I'm not in the default state");
        if (this.expecting === null)
            await this._dlg.reply("I'm not expecting anything");
        else
            await this._dlg.reply("I'm expecting a " + this.expecting);
        //for (var key of this.manager.stats.keys())
        //    await this.reply(key + ": " + this.manager.stats.get(key));
    }

    /**
      Display help messages for this stack frame.

      Returns true if contextual help is available, false otherwise.
    */
    async help() {
        // by default there is no help
        return false;
    }

    /**
      Validate the given Answer command (which is assumed compatible).

      If this method returns true, the answer will be dispatched. If false, it is
      assumed the implementation will have displayed an error.
    */
    async validateAnswer(command) {
        // by default, all answers are valid
        return true;
    }
};
