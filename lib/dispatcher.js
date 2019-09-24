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
const ThingTalk = require('thingtalk');
const AsyncQueue = require('consumer-queue');

const { ValueCategory, DispatchResult } = require('./semantic');
const QueueItem = require('./default_dialog_queue');
const Helpers = require('./helpers');

const { CancellationError } = require('./errors');
const QuestionStackFrame = require('./stack-frames/simple-scalar-question');
const YesNoQuestionStackFrame = require('./stack-frames/yes-no-question');
const MultipleChoiceStackFrame = require('./stack-frames/multiple-choice-question');

module.exports = class Dispatcher {
    constructor(manager, debug) {
        // The dispatcher maintains two queues:
        // - the user input queue contains only Intent objects from the user
        //   data is pushed into the queue when a message arrives from the user
        //   in a non-default state, and it is popped when the dialog is asking for a question (through
        //   Dispatcher.ask() or Dispatcher.nextItent())
        // - the notify queue contains QueueItem objects, which could be commands
        //   from the user, notifications, or other agent-initiated operations coming
        //   from thingengine-core
        //   data is pushed to the queue from thingengine-core through Almond's public
        //   API and through the dispatch* methods here; data is popped by the top-level
        //   dialog loop
        //
        // In the default state, the dialog thread is blocked waiting on the notify queue;
        // commands from the user are dispatched there. Otherwise, the dialog thread is
        // either busy (doing IO/network) or blocked on the user input queue (asking a
        // question). In the latter case commands from the user are dispatched to the user
        // input queue.
        //
        // This design ensures that notifications never interrupt a command from the user
        // in progress, and all commands and notifications are processed in order.
        this._userInputQueue = new AsyncQueue();
        this._notifyQueue = new AsyncQueue();

        this._debug = debug;
        this.manager = manager;
        this.formatter = new ThingTalk.Formatter(manager.platform.locale, manager.platform.timezone, manager.schemas, manager.gettext);
        this.icon = null;
        this.platformData = null;

        this._choices = null;
        this.currentAppId = null;
        this._initialized = false;

        // the manager promise / manager resolve synchronizes the user input
        // with the dialog loop; the promise is resolved when the dialog loop
        // is ready to accept the next input from the user, or when it is about
        // to process the next queue item
        this._mgrResolve = null;
        this._mgrPromise = null;
    }

    get locale() {
        return this.manager.platform.locale;
    }
    get _() {
        return this.manager._;
    }
    get ngettext() {
        return this.manager._ngettext;
    }
    get gettext() {
        return this.manager._;
    }

    debug() {
        if (!this._debug)
            return;
        console.log.apply(console, arguments);
    }

    async _nextIntent() {
        await this.manager.sendAskSpecial();
        this._mgrPromise = null;
        this._mgrResolve();
        const intent = await this._userInputQueue.pop();
        this.platformData = intent.platformData;
        return intent;
    }
    async _nextQueueItem() {
        this.icon = null;
        this.manager.expect(null);
        // only send ask special and resolve the manager promise
        // if this is not the very first queue item
        if (this._initialized) {
            await this.manager.sendAskSpecial();
            this._mgrPromise = null;
            this._mgrResolve();
        }
        this._initialized = true;
        const queueItem = await this._notifyQueue.pop();
        this.platformData = queueItem.platformData;
        return queueItem;
    }
    async _loop() {
        for (;;) {
            try {
                const item = await this._nextQueueItem();
                await item.dispatch(this);
            } catch(e) {
                if (e.code === 'ECANCELLED')
                    continue;

                await this.reply(this._("Sorry, that did not work: %s").format(Helpers.formatError(e)));
                console.error(e);
            }
        }
    }

    async fail(msg) {
        await this.reply(this._("Sorry, I did not understand that. Can you rephrase it?"));
        return true;
    }

    async forbid() {
        await this.reply(this._("I'm sorry, you don't have permission to do that."));
        await this.setContext(null);
    }
    async done() {
        await this.reply(this._("Consider it done."));
    }

    // new-style stack handling
    async pushStackFrame(stackFrame, intent) {
        // note:
        // intent === null -> call dispatch(null)
        // intent === undefined -> get a fresh intent from the user and dispatch that

        let first = true;
        await stackFrame.onPush(intent);
        try {
            for (;;) {
                // if we don't have a command, get one from the user
                if (intent === undefined) {
                    await stackFrame.setContext();
                    intent = await this._nextIntent();
                    first = false;
                }

                // For all intents except the one that caused us to push the command,
                // we check if the intent is compatible with the stack frame.
                if (!first) {
                    const accepted = await intent.dispatch(this, stackFrame);
                    if (accepted === DispatchResult.INCOMPATIBLE)
                        throw new CancellationError(this._("User cancelled"), intent);
                    if (accepted === DispatchResult.HANDLED) {
                        // we have consumed this intent, get a new one
                        intent = undefined;
                        continue;
                    }
                }

                try {
                    await stackFrame.dispatch(intent);

                    // check if the stack frame completed
                    // if so, we should return
                    if (stackFrame.isComplete)
                        return stackFrame.result;

                    // otherwise:
                    // a) we have thrown an error (either a CancellationError
                    //    or a failure), and we're in the catch clause
                    // -or-
                    // b) we have completed dispatch and consumed this intent, but the stack
                    //    frame is not done and wants more input from the user
                    //    get a new intent
                    intent = undefined;
                    // loop
                } catch(e) {
                    // handle cancellation errors: take the intent that caused the error
                    // and try to handle it here
                    if (!(e instanceof CancellationError))
                        throw e;
                    intent = e.intent;
                    first = false;
                    // loop
                }
            }
        } finally {
            await stackFrame.onPop();
        }
    }

    setContext(context) {
        this.manager.setContext(context);
    }

    async ask(expected, question) {
        await this.reply(question);
        if (expected === ValueCategory.YesNo)
            return this.pushStackFrame(new YesNoQuestionStackFrame(this));
        else
            return this.pushStackFrame(new QuestionStackFrame(this, expected));
    }
    async askChoices(question, choices) {
        await this.reply(question);
        return this.pushStackFrame(new MultipleChoiceStackFrame(this, choices));
    }
    async reset() {
        this.manager.stats.hit('sabrina-abort');
        await this.reply(this._("Sorry I couldn't help on that."));
        await this.setContext(null);
    }

    async reply(msg, icon) {
        await this.manager.sendReply(msg, icon || this.icon);
        return true;
    }

    async replyRDL(rdl, icon) {
        await this.manager.sendRDL(rdl, icon || this.icon);
        return true;
    }

    async replyChoice(idx, what, title, text) {
        await this.manager.sendChoice(idx, what, title, text);
        return true;
    }

    async replyButton(text, json) {
        await this.manager.sendButton(text, json);
        return true;
    }

    async replySpecial(text, special) {
        let json = { code: ['bookkeeping', 'special', 'special:' + special], entities: {} };
        return this.replyButton(text, json);
    }

    async replyPicture(url, icon) {
        await this.manager.sendPicture(url, icon || this.icon);
        return true;
    }

    async replyLink(title, url) {
        await this.manager.sendLink(title, url);
        return true;
    }

    async replyResult(message, icon) {
        await this.manager.sendResult(message, icon || this.icon);
        return true;
    }

    _isInDefaultState() {
        return this._notifyQueue.hasWaiter();
    }

    dispatchAskForPermission(principal, identity, program) {
        let item = new QueueItem.PermissionRequest(principal, identity, program);
        return this._pushQueueItem(item);
    }
    dispatchAskQuestion(appId, icon, type, question) {
        let item = new QueueItem.Question(appId, icon, type, question);
        return this._pushQueueItem(item);
    }
    dispatchInteractiveConfigure(kind) {
        let item = new QueueItem.InteractiveConfigure(kind);
        return this._pushQueueItem(item);
    }
    dispatchNotify(appId, icon, outputType, outputValue) {
        let item = new QueueItem.Notification(appId, icon, outputType, outputValue);
        return this._pushQueueItem(item);
    }
    dispatchNotifyError(appId, icon, error) {
        let item = new QueueItem.Error(appId, icon, error);
        return this._pushQueueItem(item);
    }
    dispatchRunProgram(program, uniqueId, identity) {
        let item = new QueueItem.RunProgram(program, uniqueId, identity);
        return this._pushQueueItem(item);
    }

    start(showWelcome) {
        let item = new QueueItem.Initialization(showWelcome);
        this._pushQueueItem(item);
        this._loop(); // no await and no catch, this runs forever and should crash on error
        return this._mgrPromise;
    }

    _pushQueueItem(item) {
        // ensure that we have something to wait on before the next
        // command is handled
        if (!this._mgrPromise)
            this._waitNextIntent();

        this._notifyQueue.push(item);
        return item.promise;
    }

    _waitNextIntent() {
        let promise = new Promise((callback, errback) => {
            this._mgrResolve = callback;
        });
        this._mgrPromise = promise;
        return promise;
    }

    async handle(intent) {
        // wait until the dialog is ready to accept commands
        await this._mgrPromise;
        assert(this._mgrPromise === null);
        const promise = this._waitNextIntent();

        if (this._isInDefaultState())
            // ignore errors from the queue item (we handle them elsewhere)
            this._pushQueueItem(new QueueItem.UserInput(intent)).catch(() => {});
        else
            this._userInputQueue.push(intent);

        return promise;
    }
};
