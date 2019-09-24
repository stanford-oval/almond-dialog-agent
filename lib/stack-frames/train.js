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
const ThingTalk = require('thingtalk');
const Describe = ThingTalk.Describe;

const DialogStackFrame = require('./base');
const { Intent, ValueCategory } = require('../semantic');

function makeContext() {
    return {
        command: null,
        previousCommand: null,
        previousCandidates: [],
        platformData: {}
    };
}

async function reconstructCanonical(dlg, code, entities) {
    const intent = await Intent.parse({ code, entities }, dlg.manager.schemas, makeContext());
    if (!intent.thingtalk)
        throw new Error('Invalid internal intent ' + intent);

    const describer = new Describe.Describer(dlg.manager.gettext, dlg.manager.locale, dlg.manager.timezone);
    return describer.describe(intent.thingtalk);
}

module.exports = class TrainStackFrame extends DialogStackFrame {
    async _failWithFallbacks(command, fallbacks) {
        let canonicals = await Promise.all(fallbacks.map((f) => {
            return Promise.resolve().then(() => {
                return reconstructCanonical(this._dlg, f.code, command.entities);
            }).catch((e) => {
                console.log('Failed to reconstruct canonical from ' + f.code.join(' ') + ': ' + e.message);
                return null;
            });
        }));

        let countCanonicals = 0;
        let singleCanonical = null;
        for (var i = 0; i < canonicals.length; i++) {
            if (canonicals[i] === null)
                continue;
            if (singleCanonical === null)
                singleCanonical = i;
            countCanonicals++;
        }

        if (countCanonicals === 0) {
            await this._dlg.fail();
            return null;
        } else if (countCanonicals === 1) {
            let target = fallbacks[singleCanonical];
            let target_canonical = canonicals[singleCanonical];

            let ok = await this._dlg.ask(ValueCategory.YesNo, this._dlg._("Did you mean %s?").format(target_canonical));
            if (ok) {
                return target;
            } else {
                await this._dlg.reset();
                return null;
            }
        } else {
            let choices = [];
            let prev = null;
            let seenCanonicals = new Set;
            for (let i = 0; i < canonicals.length; i++) {
                if (canonicals[i] === null)
                    continue;
                if (fallbacks[i] === prev)
                    continue;
                if (seenCanonicals.has(canonicals[i])) {
                    // this happens sometimes due to the exact matcher duplicating
                    // some results from the regular matcher, ignore it
                    continue;
                }
                seenCanonicals.add(canonicals[i]);
                choices.push([fallbacks[i], canonicals[i]]);
                prev = fallbacks[i];
            }
            choices.push([null, this._dlg._("none of the above")]);

            let idx = await this._dlg.askChoices(this._dlg._("Did you mean any of the following?"), choices.map(([json, text]) => text));
            if (idx === choices.length - 1) {
                await this._dlg.reset();
                return null;
            } else {
                return choices[idx][0];
            }
        }
    }

    async dispatch(intent) {
        assert(intent instanceof Intent.Train);

        // mark that the frame will be complete when we return
        this.complete();

        const command = intent.command;
        if (command === null) {
            await this._dlg.reply(this._dlg._("Your last command was a button. I know what a button means. 😛"));
            return;
        }
        const chosen = await this._failWithFallbacks(command, intent.fallbacks);

        let tokens = command.tokens;
        let learn = tokens.length > 0;

        if (!chosen)
            return;

        this._dlg.manager.stats.hit('sabrina-fallback-successful');

        if (learn) {
            this._dlg.manager.stats.hit('sabrina-online-learn');
            this._dlg.manager.parser.onlineLearn(command.utterance, chosen.code);

            const prefs = this._dlg.manager.platform.getSharedPreferences();
            let count = prefs.get('almond-online-learn-count');
            if (count === undefined)
                count = 0;
            count++;
            prefs.set('almond-online-learn-count', count);

            await this._dlg.reply(this._dlg._("Thanks, I made a note of that."));
            await this._dlg.reply(this._dlg.ngettext("You have trained me with %d sentence.", "You have trained me with %d sentences.", count).format(count));
        }

        // handle the command at the next event loop iteration
        // to avoid reentrancy
        //
        // FIXME: instead, we should run this immediately, inside this promise, and not return
        // until the whole task is done
        //
        // (except we don't do this inside auto_test_almond cause it breaks the test script)
        if (this._dlg.manager._options.testMode)
            return;
        setImmediate(() => {
            this._dlg.manager.handleParsedCommand({ code: chosen.code, entities: command.entities });
        });
    }
};
