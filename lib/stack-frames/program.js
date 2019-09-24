// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const uuid = require('uuid');

const ThingTalk = require('thingtalk');
const Describe = ThingTalk.Describe;

const { Intent, ValueCategory}  = require('../semantic');
const Helpers = require('../helpers');

const { slotFillProgram } = require('../dialogs/slot_filling');

const ConfigureMessagingStackFrame = require('./messaging');
const ResultStackFrame = require('./result');

function isSafeAction(invocation) {
    if (invocation.selector.principal !== null)
        return false;
    const annotations = invocation.schema.annotations;
    if (annotations.confirm && !annotations.confirm.toJS())
        return true;
    return false;
}

const DialogStackFrame = require('./base');

function getProgramSignature(program) {
    let functions = [];
    for (let [, prim] of program.iteratePrimitives()) {
        if (prim.isInvocation)
            functions.push(prim.selector.kind + ':' + prim.channel);
    }
    return functions.join('+');
}

module.exports = class ProgramStackFrame extends DialogStackFrame {
    constructor(dlg, uniqueId, sourceIdentity) {
        super(dlg);
        this._uniqueId = uniqueId;
        this._sourceIdentity = sourceIdentity;

        this._signature = null;
        this._program = null;
        this._icon = null;
    }

    async onPush(firstIntent) {
        assert(firstIntent instanceof Intent.Program);
        this._program = firstIntent.program;
        this._signature = getProgramSignature(firstIntent.program);

        return super.onPush(firstIntent);
    }

    setContext() {
        this._dlg.setContext(this._program);

        // set the icon back to the program icon (icon might be changed inside slot filling)
        this._dlg.icon = this._icon;
        super.setContext();
    }

    compatible(command) {
        // if we have a pre-set unique ID, or if this program came from outside, don't allow
        // the user to modify it
        // instead, the user's command will reset the stack and start a new program
        if (this._uniqueId || this._sourceIdentity)
            return false;

        return command instanceof Intent.Program && getProgramSignature(command.program) === this._signature;
    }

    _getIdentityName(identity) {
        var split = identity.split(':');

        if (split[0] === 'omlet')
            return this._dlg._("Omlet User @%s").format(split[1]);

        let contactApi = this._manager.platform.getCapability('contacts');
        if (contactApi !== null) {
            return contactApi.lookupPrincipal(identity).then((contact) => {
                if (contact)
                    return contact.displayName;
                else
                    return split[1];
            });
        } else {
            return split[1];
        }
    }

    async _prepareProgram(source) {
        let hasTrigger = this._program.rules.length > 0 && this._program.rules.some((r) => r.isRule);
        let primitiveQuery = undefined;
        let primitiveAction = undefined;
        let hasResult = false;
        let primCount = 0;
        this._icon = null;

        for (let [primType, prim] of this._program.iteratePrimitives()) {
            if (prim.selector.isBuiltin) {
                if (prim.channel === 'notify' && !hasTrigger)
                    hasResult = true;
                continue;
            }
            primCount += 1;
            if (primType === 'query') {
                if (primitiveQuery === undefined)
                    primitiveQuery = prim;
                else
                    primitiveQuery = null;
            } else if (primType === 'action') {
                if (primitiveAction === undefined)
                    primitiveAction = prim;
                else
                    primitiveAction = null;
            }
        }
        if (this._manager.isAnonymous) {
            if (hasTrigger || !primitiveQuery) {
                await this._dlg.reply(this._dlg._("Sorry, to execute this command you must log in to your personal account."));
                await this._dlg.replyLink(this._dlg._("Register for Almond"), "/user/register");
                this._program = null;
                this.setContext();
                return { ok: false };
            }
        }

        const icon = Helpers.getProgramIcon(this._program);
        this._icon = icon;

        let hasSlots = false;
        for (let slot of this._program.iterateSlots2()) {
            if (slot instanceof ThingTalk.Ast.Selector || !slot.isUndefined())
                continue;
            let type = slot.type;
            if (!type.isBoolean && !type.isEnum)
                hasSlots = true;
        }

        let programType = 'general';
        if (this._program.principal === null && !source && !hasTrigger && primCount === 1) {
            if (primitiveAction && isSafeAction(primitiveAction))
                programType = 'safeAction';
            if (primitiveQuery)
                programType = 'query';
        }
        if (this._program.principal !== null)
            hasResult = false;

        return { ok: true, programType, hasTrigger, hasSlots, hasResult, icon };
    }

    async _confirm(description, source) {
        if (source)
            return this._dlg.ask(ValueCategory.YesNo, this._dlg._("Ok, so you want me to %s (as asked by %s). Is that right?").format(description, source));
        else
            return this._dlg.ask(ValueCategory.YesNo, this._dlg._("Ok, so you want me to %s. Is that right?").format(description));
    }

    async _ruleDialog(intent) {
        let source = this._sourceIdentity ? await this._getIdentityName(this._sourceIdentity) : null;

        let program = intent.program;
        this._program = program;

        assert(program.isProgram);
        this._dlg.debug('About to execute program', program.prettyprint());

        if (program.principal !== null) {
            if (this._manager.remote === null) {
                await this._dlg.reply("Sorry, this version of Almond does not support asking other users for permission.");
                this._program = null;
                this.setContext();
                return;
            }
            if (this._manager.isAnonymous) {
                await this._dlg.reply(this._dlg._("Sorry, to execute this command you must log in to your personal account."));
                await this._dlg.replyLink(this._dlg._("Register for Almond"), "/user/register");
                this._program = null;
                this.setContext();
                return;
            }
        }

        // check for permission on the incomplete program first
        // this is an incomplete check, but we do it early before
        // asking questions to the user
        if (!await this._manager.user.canExecute(program)) {
            await this._dlg.forbid();
            return;
        }

        if (program.principal !== null) {
            if (!await this.pushStackFrame(new ConfigureMessagingStackFrame(this._dlg), null))
                return;
        }

        let { ok, programType, hasTrigger, hasSlots, hasResult, icon } = await this._prepareProgram(source);
        if (!ok)
            return;

        let description = Describe.describeProgram(this._manager.gettext, program);
        if (!intent.confident) {
            let confirmation = await this._confirm(description, source);
            if (!confirmation) {
                this._dlg.reset();
                return;
            }
            this._manager.stats.hit('sabrina-confirm');
        }

        ok = await slotFillProgram(this._dlg, program);
        if (!ok)
            return;


        program = await this._manager.user.applyPermissionRules(program);
        if (program === null) {
            await this._dlg.forbid();
            return;
        }

        // update description after the slots are filled
        description = Describe.describeProgram(this._manager.gettext, program);

        // FIXME should not be needed
        this.setContext();

        if (programType === 'general' && hasSlots) {
            let confirmation = await this._confirm(description, source);
            if (!confirmation) {
                this._dlg.reset();
                return;
            }
            this._manager.stats.hit('sabrina-confirm');
        }

        let echo = programType === 'safeAction' || ( intent.confident && programType === 'general' && !hasSlots );
        if (echo) {
            if (source)
                await this._dlg.reply(this._dlg._("I'm going to %s (as asked by %s).").format(description, source));
            else
                await this._dlg.reply(this._dlg._("Ok, I'm going to %s.").format(description));
        }

        let options;
        [program, description, options] = await this._manager.user.adjustProgram(program, description, {});

        options.uniqueId = this._uniqueId || 'uuid-' + uuid.v4();
        options.description = description;
        options.icon = icon||null;
        if (!hasTrigger)
            options.conversation = this._manager.id;

        await this._manager.user.logProgramExecution(this._uniqueId, program, description, options);
        const app = await this._manager.apps.createApp(program, options);

        await this._dlg.pushStackFrame(new ResultStackFrame(this._dlg, program, app, hasResult, echo), null);
    }

    async dispatch(intent) {
        this._dlg.manager.stats.hit('sabrina-command-rule');

        await this._ruleDialog(intent);

        this.complete();
    }
};
