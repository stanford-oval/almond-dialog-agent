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

const Helpers = require('../helpers');
const AsyncQuestionStackFrame = require('./async-question');

const PAGE_SIZE = 5;

async function drain(output) {
    for (;;) {
        let { item, resolve } = await output.next();
        resolve();
        if (item.isDone)
            return;
    }
}

module.exports = class ResultStackFrame extends DialogStackFrame {
    constructor(dlg, program, app, hasResult, echo) {
        super(dlg);

        this._program = program;
        this._app = app;
        this._hasResult = hasResult;
        this._echo = echo;

        this._results = [];
        this._drained = this._app === null;
        this._index = 0;
    }

    setContext() {
        this._dlg.setContext(this._program);
        if (this._app)
            this._dlg.currentAppId = this._app.uniqueId;
        return super.setContext();
    }

    get expecting() {
        return ValueCategory.MORE;
    }

    compatible(command) {
        return command instanceof Intent.More || command instanceof Intent.Back;
    }

    async _finish() {
        if (!this._drained) {
            // drain the output so that the app finishes running, otherwise
            // we might leave it unfinished and have to rely on GC to release its
            // resources
            await drain(this._app.mainOutput);
        }

        if (this._results.length === 0) {
            if (this._hasResult)
                await this._dlg.reply(this._dlg._("Sorry, I did not find any result for that."));
            // if we didn't echo before execution, say "Consider it done"
            else if (!this._echo)
                await this._dlg.done();
        }
        this.complete();
    }

    async dispatch(intent) {
        if (intent instanceof Intent.Back)
            await this._dispatchBack();
        else
            await this._dispatchMore();
    }

    async _displayPage() {
        for (let i = this._index; i < Math.min(this._index + PAGE_SIZE, this._results.length); i++) {
            const next = this._results[i];

            if (next.isNotification)
                await Helpers.showNotification(this._dlg, undefined, next.icon, next.outputType, next.outputValue, next.currentChannel, undefined);
            else if (next.isError)
                await Helpers.showError(this._dlg, undefined, next.icon, next.error, undefined);
        }
        this._index = Math.min(this._index + PAGE_SIZE, this._results.length);

        // if we have more results, add the option to show them
        if (!this._drained || this._index < this._results.length)
            await this._dlg.replySpecial(this._dlg._("Show more result…"), 'more');

        // note: we don't show a button for "Back"
        // back is only useful in a voice-only UI - in a graphical UI, you'd just scroll up to see more
    }

    async _displayBack() {
        // index is at the end of the page we just displayed, so we need to go back two pages
        this._index = Math.max(0, this._index - 2 * PAGE_SIZE);
        await this._displayPage();
    }

    async _dispatchMore() {
        // if we don't have a full page of results cached, get more results from the app
        if (!this._drained && this._results.length < this._index + PAGE_SIZE)
            await this._fetchResults();

        await this._displayPage();

        // if we have one page or less of results, we're done here
        if (this._drained || this._results.length <= PAGE_SIZE)
            await this._finish();
    }

    async _fetchResults() {
        // try to read one more element past the current page size, so we know if we're done or not
        while (this._results.length < this._index + PAGE_SIZE + 1) {
            let { item: next, resolve, reject } = await this._app.mainOutput.next();
            if (next.isQuestion) {
                try {
                    const value = await this._dlg.pushStackFrame(new AsyncQuestionStackFrame(this._dlg, undefined, next.icon, next.type, next.question), null);
                    resolve(value);
                } catch(e) {
                    reject(e);
                }
                continue;
            }

            // resolve immediately so that the program can continue and
            // push the next result in the `app.mainOutput` queue
            resolve();
            if (next.isDone) {
                this._drained = true;
                break;
            }

            this._results.push(next);
        }
    }
};
