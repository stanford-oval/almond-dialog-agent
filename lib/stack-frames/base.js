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

module.exports = class DialogStackFrame {
    constructor(dlg) {
        this._manager = dlg.manager;
        this._dlg = dlg;

        this._completed = false;
        this._frameResult = undefined;
    }

    /**
      Hook onto stack management.

      @param {Intent|null|undefined} firstIntent - the intent that caused the stack frame to be pushed.

      This method will be only called once, even if the stack frame is handling
      multiple intents. It can be used to extract information necessary to compute
      whether a command is compatible or not.
    */
    async onPush() {
        this.setContext();
    }

    /**
      Hook onto stack management.

      This method will be called once, before the stack frame is popped.
      It is useful to release resources.
    */
    async onPop() {}

    /**
      Set the context for this stack frame.

      This method will be called before reading a command from the user.
      It might be called multiple times to handle multiple commands.
     */
    setContext() {
        this._manager.expect(this.expecting);
    }

    /**
      "Handle" the given intent (which is assumed compatible).

      @param {Intent} intent - the intent to handle.

      Stack frames are assumed stateless, and this method can be called multiple
      times on the same stack frame (between one pair of onPush/onPop).
      So for example, in a program stack frame, every time the user issues a new
      program that is compatible with the current one (a follow-up or refinement),
      dispatch() will be called on the stack frame object.

      Inside a dispatch, the stack frame can:

      - make API/IO calls and await them
      - call dlg.reply() and similar methods to send messages to the user
      - call dlg.pushStackFrame() to push another stack frame on top, and await
        the result of that
      - call dlg.ask() to ask a scalar question
      - call this.complete(result) to mark this stack frame as complete

      If the stack frame wants to preserve state, it should declare itself
      to have no compatible commands, and push subframes with suitable compatible
      commands at the different points of the stack.

      As an escape hatch, a stack frame can push a CustomStackFrame to have raw
      access to a user's input of a certain type.
    */
    /* instanbul ignore next */
    async dispatch(intent) {
        throw new Error('abstract method');
    }

    /**
      Mark this stack frame as complete

      @param {any} result - the result of this stack frame.

      After calling this method and returning from dispatch(), the stack frame
      will be popped and the result will be passed as return value to the caller
      of pushStackFrame().

      If a method returns from dispatch() without calling complete(), processing
      will block until the user issues a new command, which will be then dispatched
      to this stack frame again.

      It is possible, but not recommended, to call complete() multiple times, and the
      each call will override the result.
    */
    complete(result) {
        this._completed = true;
        this._frameResult = result;
    }

    /**
      Check if this stack frame was completed.
    */
    get isComplete() {
        return this._completed;
    }

    /**
      The return value of this stack frame.

      This is only valid to call if the stack frame is complete.
    */
    get result() {
        assert(this._completed);
        return this._frameResult;
    }

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
};
