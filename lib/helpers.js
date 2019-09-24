// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

const SLOT_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;
function normalizeSlot(t) {
    let res = SLOT_REGEX.exec(t);
    if (!res)
        return t;
    let [match, param1, param2,] = res;
    if (match === '$$')
        return '$';
    return '$' + (param1 || param2);
}

function capitalize(str) {
    return (str[0].toUpperCase() + str.substr(1)).replace(/[.\-_]([a-z])/g, (whole, char) => ' ' + char.toUpperCase()).replace(/[.\-_]/g, '');
}

function presentExample(dlg, utterance) {
    // on Android, we have app-level slot filling which is more powerful, so we don't
    // want to lose the argument name information
    if (dlg.manager.platform.type === 'android' || dlg.manager.platform.type === 'test')
        utterance = utterance.split(' ').map((t) => t.startsWith('$') ? normalizeSlot(t) : t).join(' ');
    else
        utterance = utterance.split(' ').map((t) => t.startsWith('$') ? '____' : t).join(' ');
    if (utterance.startsWith(', '))
        utterance = utterance.substring(2);
    return utterance;
}

function loadOneExample(dlg, ex) {
    // refuse to slot fill pictures
    for (let name in ex.args) {
        let type = ex.args[name];
        // avoid examples such as "post __" for both text and picture (should be "post picture" without slot for picture)
        if (type.isEntity && type.type === 'tt:picture')
            return null;
    }

    // turn the declaration into a program
    let newprogram = ex.toProgram();
    let slots = [];
    let slotTypes = {};
    for (let name in ex.args) {
        slotTypes[name] = String(ex.args[name]);
        slots.push(name);
    }

    let code = ThingTalk.NNSyntax.toNN(newprogram, {});
    let monitorable;
    if (ex.type === 'stream')
        monitorable = true;
    else if (ex.type === 'action')
        monitorable = false;
    else if (ex.type === 'query')
        monitorable = ex.value.schema.is_monitorable;
    else
        monitorable = false;
    return { utterance: ex.utterances[0],
             type: ex.type,
             monitorable: monitorable,
             target: {
                example_id: ex.id, code: code, entities: {}, slotTypes: slotTypes, slots: slots } };
}

async function showNotification(dlg, appId, icon, outputType, outputValue, previousAppId) {
    let app;
    if (appId !== undefined)
        app = dlg.manager.apps.getApp(appId);
    else
        app = undefined;

    let messages;
    if (outputType !== null)
        messages = await dlg.formatter.formatForType(outputType, outputValue, 'messages');
    else
        messages = outputValue;
    if (!Array.isArray(messages))
        messages = [messages];

    let notifyOne = async (message) => {
        if (typeof message === 'string')
            message = { type: 'text', text: message };

        if (typeof message !== 'object')
            return;

        if (message.type === 'text') {
            await dlg.reply(message.text, icon);
        } else if (message.type === 'picture') {
            if (message.url === undefined)
                await dlg.reply("Sorry, I can't find the picture you want.", icon);
            else
                await dlg.replyPicture(message.url, icon);
        } else if (message.type === 'rdl') {
            await dlg.replyRDL(message, icon);
        } else if (message.type === 'button') {
            await dlg.replyButton(message.text, message.json);
        } else if (message.type === 'program') {
            const loaded = loadOneExample(dlg, message.program);
            await dlg.replyButton(presentExample(dlg, loaded.utterance), loaded.target);
        } else {
            await dlg.replyResult(message, icon);
        }
    };
    if (app !== undefined && app.isRunning && appId !== previousAppId &&
        (messages.length === 1 && (typeof messages[0] === 'string' || messages[0].type === 'text'))) {
        const msg = typeof messages[0] === 'string' ? messages[0] : messages[0].text;
        await dlg.reply(dlg._("Notification from %s: %s").format(app.name, msg), icon);
    } else {
        if (app !== undefined && app.isRunning && appId !== previousAppId)
            await dlg.reply(dlg._("Notification from %s").format(app.name), icon);
        for (let msg of messages)
            await notifyOne(msg);
    }
}

async function showError(dlg, appId, icon, error) {
    let app;
    if (appId !== undefined)
        app = dlg.manager.apps.getApp(appId);
    else
        app = undefined;

    let errorMessage;
    if (typeof error === 'string')
        errorMessage = error;
    else if (error.name === 'SyntaxError')
        errorMessage = dlg._("Syntax error at %s line %d: %s").format(error.fileName, error.lineNumber, error.message);
    else if (error.message)
        errorMessage = error.message;
    else
        errorMessage = String(error);
    console.log('Error from ' + appId, error);

    if (app !== undefined && app.isRunning)
        await dlg.reply(dlg._("%s had an error: %s.").format(app.name, errorMessage), icon);
    else
        await dlg.reply(dlg._("Sorry, that did not work: %s.").format(errorMessage), icon);
}

module.exports = {
    showNotification,
    showError,

    formatError(e) {
        if (e.name === 'SyntaxError')
            return "Syntax error at line " + e.lineNumber + ": " + e.message;
        else if (typeof e === 'string')
            return e;
        else if (e.message)
            return e.message;
        else
            return e;
    },

    makeFilterCandidates(prim) {
        let schema = prim.schema;
        let filterCandidates = [];
        function doMake(from) {
            for (let argname in from) {
                let type = from[argname];
                let ops;
                if (type.isString)
                    ops = ['==', '!==', '=~', '!=~'];
                else if (type.isNumber || type.isMeasure || type.isDate || type.isTime)
                    ops = ['==', '>=', '<='];
                else if (type.isArray)
                    ops = ['contains', '!contains'];
                else if (type.isEntity && ['tt:picture', 'tt:url'].indexOf(type.type) >= 0)
                    ops = [];
                else if (type.isBoolean)
                    ops = ['=='];
                else
                    ops = ['==', '!=='];
                for (let op of ops) {
                    let filter;
                    let negate = false;
                    if (op.startsWith('!')) {
                        op = op.substring(1);
                        negate = true;
                    }
                    filter = new Ast.BooleanExpression.Atom(argname, op, Ast.Value.Undefined(true));
                    if (negate)
                        filter = Ast.BooleanExpression.Not(filter);
                    filterCandidates.push(filter);
                }
            }
        }

        if (prim instanceof Ast.PermissionFunction) {
            doMake(schema.inReq);
            doMake(schema.inOpt);
            doMake(schema.out);
        } else {
            doMake(schema.out);
        }

        return filterCandidates;
    },

    describeFilter(dlg, schema, filter) {
        return ThingTalk.Describe.describeFilter(dlg.manager.gettext, filter, schema);
    },

    presentFilterCandidates(dlg, schema, filterCandidates) {
        filterCandidates.forEach((filter) => {
            let atom = filter.isNot ? filter.expr : filter;
            let argname = atom.name;
            let ptype = schema.out[argname] || schema.inReq[argname] || schema.inOpt[argname];
            let vtype = ptype;
            if (atom.operator === 'contains')
                vtype = ptype.elem;

            let code;
            if (filter.isNot)
                code = ['bookkeeping', 'filter', 'not', 'param:' + argname + ':' + ptype, atom.operator, 'SLOT_0'];
            else
                code = ['bookkeeping', 'filter', 'param:' + argname + ':' + ptype, atom.operator, 'SLOT_0'];

            let obj = {
                code,
                entities: {},
                slots: [argname],
                slotTypes: {
                    [argname]: String(vtype)
                }
            };

            const description = this.describeFilter(dlg, schema, filter, true)
                .replace('____', '$' + argname);
            dlg.replyButton(this.presentExample(dlg, description), obj);
        });
    },

    presentExample,
    loadOneExample,

    async loadExamples(dlg, dataset, maxCount) {
        const parsed = await ThingTalk.Grammar.parseAndTypecheck(dataset, dlg.manager.schemas);
        const parsedDataset = parsed.datasets[0];

        if (maxCount === undefined)
            maxCount = parsedDataset.examples.length;
        else
            maxCount = Math.min(parsedDataset.examples.length, maxCount);
        let output = [];
        for (let i = 0; i < maxCount; i++) {
            const loaded = this.loadOneExample(dlg, parsedDataset.examples[i]);
            if (loaded !== null)
                output.push(loaded);
        }
        return output;
    },

    presentExampleList(dlg, examples, isLocal=true) {
        for (let ex of examples) {
            if (!isLocal)
                ex.utterance = ex.utterance.replace(/\b(my)\b/g, 'their').replace(/\b(me)\b/, 'them').replace(/\b(i|I)\b/g, 'they').replace(/\bnotify them\b/g, 'notify me');
            dlg.replyButton(this.presentExample(dlg, ex.utterance), ex.target);
        }
    },

    presentSingleExample(dlg, utterance, target) {
        // if we have slots to fill, show the template to the user, otherwise just run
        // the example right away

        if (target.slots && target.slots.length > 0) {
            dlg.replyButton(this.presentExample(dlg, utterance), target);
        } else {
            // handle the command at the next event loop iteration
            // to avoid reentrancy
            //
            // FIXME: instead, we should run this immediately, inside this promise, and not return
            // until the whole task is done
            //
            setImmediate(() => {
                dlg.manager.handleParsedCommand(target);
            });
        }
    },

    isPlatformBuiltin(kind) {
        return kind.startsWith('org.thingpedia.builtin.thingengine');
    },

    getProgramIcon(program) {
        let icon = null;
        for (let [, prim] of program.iteratePrimitives()) {
            if (prim.selector.isBuiltin)
                continue;
            let newIcon = this.getIcon(prim);
            // ignore builtin/platform devices when choosing the icon
            if (!newIcon || this.isPlatformBuiltin(newIcon))
                continue;
            icon = newIcon;
        }
        return icon;
    },

    getIcon(prim) {
        let kind;
        if (prim === null)
            return null;
        if (prim instanceof Ast.PermissionFunction)
            kind = prim.kind;
        else if (prim.selector.isDevice)
            kind = prim.selector.kind;

        if (kind && kind !== 'remote' && !kind.startsWith('__dyn')) {
            if (prim.selector && prim.selector.device)
                return prim.selector.device.kind;
            else
                return kind;
        } else {
            return null;
        }
    },

    cleanKind(kind) {
        if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
            kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
        // org.thingpedia.builtin.omlet -> omlet
        if (kind.startsWith('org.thingpedia.builtin.'))
            kind = kind.substr('org.thingpedia.builtin.'.length);
        // org.thingpedia.weather -> weather
        if (kind.startsWith('org.thingpedia.'))
            kind = kind.substr('org.thingpedia.'.length);
        // com.xkcd -> xkcd
        if (kind.startsWith('com.'))
            kind = kind.substr('com.'.length);
        if (kind.startsWith('gov.'))
            kind = kind.substr('gov.'.length);
        if (kind.startsWith('org.'))
            kind = kind.substr('org.'.length);
        if (kind.startsWith('uk.co.'))
            kind = kind.substr('uk.co.'.length);

        return capitalize(kind);
    }
};
