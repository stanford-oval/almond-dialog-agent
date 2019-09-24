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

const adt = require('adt');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;

const DispatchResult = {
    INCOMPATIBLE: -1,
    COMPATIBLE: 0,
    HANDLED: 1,
};

const ValueCategory = adt.data({
    YesNo: null,
    MultipleChoice: null,

    Number: null,
    Measure: { unit: adt.only(String) },
    RawString: null,
    Password: null,
    Date: null,
    Time: null,
    Unknown: null,
    Picture: null,
    Location: null,
    PhoneNumber: null,
    EmailAddress: null,
    Contact: null,
    Predicate: null,
    PermissionResponse: null,
    Command: null,
    More: null
});

ValueCategory.fromValue = function fromValue(value) {
    if (value.isVarRef)
        return ValueCategory.Unknown;

    var type = value.getType();

    if (type.isEntity && type.type === 'tt:picture')
        return ValueCategory.Picture;
    else if (type.isEntity && type.type === 'tt:phone_number')
        return ValueCategory.PhoneNumber;
    else if (type.isEntity && type.type === 'tt:email_address')
        return ValueCategory.EmailAddress;
    else if (type.isEntity && type.type === 'tt:contact')
        return ValueCategory.Contact;
    else if (type.isEntity)
        return ValueCategory.RawString;
    else if (type.isBoolean)
        return ValueCategory.YesNo;
    else if (type.isString)
        return ValueCategory.RawString;
    else if (type.isNumber)
        return ValueCategory.Number;
    else if (type.isMeasure)
        return ValueCategory.Measure(type.unit);
    else if (type.isEnum)
        return ValueCategory.RawString;
    else if (type.isTime)
        return ValueCategory.Time;
    else if (type.isDate)
        return ValueCategory.Date;
    else if (type.isLocation)
        return ValueCategory.Location;
    else
        return ValueCategory.Unknown;
};

ValueCategory.toAskSpecial = function toAskSpecial(expected) {
    let what;
    if (expected === ValueCategory.YesNo)
        what = 'yesno';
    else if (expected === ValueCategory.Location)
        what = 'location';
    else if (expected === ValueCategory.Picture)
        what = 'picture';
    else if (expected === ValueCategory.PhoneNumber)
        what = 'phone_number';
    else if (expected === ValueCategory.EmailAddress)
        what = 'email_address';
    else if (expected === ValueCategory.Contact)
        what = 'contact';
    else if (expected === ValueCategory.Number)
        what = 'number';
    else if (expected === ValueCategory.Date)
        what = 'date';
    else if (expected === ValueCategory.Time)
        what = 'time';
    else if (expected === ValueCategory.RawString)
        what = 'raw_string';
    else if (expected === ValueCategory.Password)
        what = 'password';
    else if (expected === ValueCategory.MultipleChoice)
        what = 'choice';
    else if (expected === ValueCategory.Command)
        what = 'command';
    else if (expected !== null)
        what = 'generic';
    else
        what = null;
    return what;
};

class Intent {
    constructor(thingtalk, platformData = {}) {
        this.thingtalk = thingtalk;
        this.platformData = platformData;

        // set confident = true only if
        // 1) we are not dealing with natural language (code, gui, etc), or
        // 2) we find an exact match
        this.confident = false;
    }

    /**
      Attempt dispatching this command on the given stack frame.

      If dispatch() returns DispatchResult.INCOMPATIBLE, the stack
      will be popped and the command will be retried in the new stack.
      If dispatch() returns DispatchResult.COMPATIBLE, the stack
      is unchanged and the command is dispatched to the dialog thread.
      If dispatch() returns DispatchResult.HANDLED, the command is assumed
      handled and no further processing occurs.
    */
    async dispatch(dlg, stackFrame) {
        // by default, we check if the stack frame is compatible with the command
        // some commands are handled by all stack frames, and override this
        if (stackFrame.compatible(this))
            return DispatchResult.COMPATIBLE;
        else
            return DispatchResult.INCOMPATIBLE;
    }

    static fromThingTalk(thingtalk, context) {
        if (thingtalk.isBookkeeping) {
            if (thingtalk.intent.isSpecial)
                return parseSpecial(thingtalk, context);
            else if (thingtalk.intent.isAnswer)
                return new Intent.Answer(ValueCategory.fromValue(thingtalk.intent.value), thingtalk.intent.value, thingtalk, context.platformData);
            else if (thingtalk.intent.isPredicate)
                return new Intent.Predicate(thingtalk.intent.predicate, thingtalk, context.platformData);
            else if (thingtalk.intent.isCommandList)
                return new Intent.CommandList(thingtalk.intent.device.isUndefined ? null : String(thingtalk.intent.device.toJS()), thingtalk.intent.category, thingtalk, context.platformData);
            else if (thingtalk.intent.isChoice)
                return new Intent.Answer(ValueCategory.MultipleChoice, thingtalk.intent.value, thingtalk, context.platformData);
            else
                throw new TypeError(`Unrecognized bookkeeping intent`);
        } else if (thingtalk.isProgram) {
            return new Intent.Program(thingtalk, thingtalk, context.platformData);
        } else if (thingtalk.isPermissionRule) {
            return new Intent.PermissionRule(thingtalk, thingtalk, context.platformData);
        } else {
            throw new TypeError(`Unrecognized ThingTalk command: ${thingtalk.prettyprint()}`);
        }
    }

    static async parse(json, schemaRetriever, context) {
        if ('program' in json)
            return Intent.fromThingTalk(await ThingTalk.Grammar.parseAndTypecheck(json.program, schemaRetriever, true), context);

        let { code, entities } = json;
        for (let name in entities) {
            if (name.startsWith('SLOT_')) {
                let slotname = json.slots[parseInt(name.substring('SLOT_'.length))];
                let slotType = ThingTalk.Type.fromString(json.slotTypes[slotname]);
                let value = ThingTalk.Ast.Value.fromJSON(slotType, entities[name]);
                entities[name] = value;
            }
        }

        const thingtalk = ThingTalk.NNSyntax.fromNN(code, entities);
        await thingtalk.typecheck(schemaRetriever, true);
        return Intent.fromThingTalk(thingtalk, context);
    }

    static async parseThingTalk(code, schemaRetriever, context) {
        return Intent.fromThingTalk(await ThingTalk.Grammar.parseAndTypecheck(code, schemaRetriever, true), context);
    }
}

// internally generated intents that have no thingtalk representation
Intent.Unsupported = class UnsupportedIntent extends Intent {
    constructor(platformData) {
        super(null, platformData);
        // internally generated intents are always confident
        this.confident = true;
    }

    async dispatch(dlg, stackFrame) {
        // display an error without stack changes
        await dlg.reply(dlg._("Sorry, I don't know how to do that yet."));
        return DispatchResult.HANDLED;
    }
};
Intent.Example = class ExampleIntent extends Intent {
    constructor(utterance, targetCode, platformData) {
        super(null, platformData);
        this.utterance = utterance;
        this.targetCode = targetCode;

        // internally generated intents are always confident
        this.confident = true;
    }
};
Intent.Failed = class FailedIntent extends Intent {
    constructor(command, platformData) {
        super(null, platformData);
        // internally generated intents are always confident
        this.confident = true;
    }

    async dispatch(dlg, stackFrame) {
        // display an error without stack changes
        await dlg.reply(dlg._("Sorry, I did not understand that. Use ‘help’ to learn what I can do for you."));
        return DispatchResult.HANDLED;
    }
};

// bookkeeping intents that require special handling in the dialogues and the dispatcher

Intent.Debug = class DebugIntent extends Intent {
    async dispatch(dlg, stackFrame) {
        await stackFrame.debug();
        return DispatchResult.HANDLED;
    }
};

// do nothing and wake up the screen
Intent.WakeUp = class WakeUpIntent extends Intent {
    async dispatch(dlg, stackFrame) {
        return DispatchResult.HANDLED;
    }
};

// ask for contextual help, or start a new task
Intent.Help = class HelpIntent extends Intent {
    async dispatch(dlg, stackFrame) {
        if (await stackFrame.help())
            return DispatchResult.HANDLED;
        else
            return super.dispatch(dlg, stackFrame);
    }
};

// other bookkeeping intents
Intent.Train = class TrainIntent extends Intent {
    constructor(command, fallbacks, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.command = command;
        this.fallbacks = fallbacks;
    }
};
Intent.Back = class BackIntent extends Intent {};
Intent.More = class MoreIntent extends Intent {};
Intent.Empty = class EmptyIntent extends Intent {};
Intent.Maybe = class MaybeIntent extends Intent {};
Intent.NeverMind = class NeverMindIntent extends Intent {};  // cancel the current task
Intent.Stop = class StopIntent extends Intent {}; // cancel the current task, quietly
Intent.Make = class MakeIntent extends Intent {}; // reset and start a new task

Intent.CommandList = class CommandListIntent extends Intent {
    constructor(device, category, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.device = device;
        this.category = category;
    }
};
Intent.Yes = class YesIntent extends Intent {
    constructor(thingtalk, platformData) {
        super(thingtalk, platformData);
        this.category = ValueCategory.Boolean;
        this.value = Ast.Value.Boolean(true);
    }

    async dispatch(dlg, stackFrame) {
        if (stackFrame.compatible(this))
            return DispatchResult.COMPATIBLE;

        await dlg.reply(dlg._("Yes what?"));
        return DispatchResult.HANDLED;
    }
};
Intent.No = class NoIntent extends Intent {
    constructor(thingtalk, platformData) {
        super(thingtalk, platformData);
        this.category = ValueCategory.Boolean;
        this.value = Ast.Value.Boolean(false);
    }

    async dispatch(dlg, stackFrame) {
        if (stackFrame.compatible(this))
            return DispatchResult.COMPATIBLE;

        await dlg.reply(dlg._("No what?"));
        return DispatchResult.HANDLED;
    }
};
Intent.Answer = class AnswerIntent extends Intent {
    constructor(category, value, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.category = category;
        this.value = value;
    }
};

// plain thingtalk
Intent.Program = class ProgramIntent extends Intent {
    constructor(program, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.program = program;
    }
};
Intent.Predicate = class PredicateIntent extends Intent {
    constructor(predicate, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.predicate = predicate;
    }
};
Intent.PermissionRule = class PermissionRuleIntent extends Intent {
    constructor(rule, thingtalk, platformData) {
        super(thingtalk, platformData);
        this.rule = rule;
    }
};

const SPECIAL_INTENT_MAP = {
    makerule: Intent.Make,
    empty: Intent.Empty,
    back: Intent.Back,
    more: Intent.More,
    nevermind: Intent.NeverMind,
    debug: Intent.Debug,
    help: Intent.Help,
    maybe: Intent.Maybe,
    stop: Intent.Stop,
    wakeup: Intent.WakeUp,
};

function parseSpecial(thingtalk, context) {
    let intent;
    switch (thingtalk.intent.type) {
    case 'yes':
        intent = new Intent.Yes(thingtalk, context.platformData);
        break;
    case 'no':
        intent = new Intent.No(thingtalk, context.platformData);
        break;
    case 'failed':
        intent = new Intent.Failed(context.command, context.platformData);
        break;
    case 'train':
        intent = new Intent.Train(context.previousCommand, context.previousCandidates, thingtalk, context.platformData);
        break;
    default:
        if (SPECIAL_INTENT_MAP[thingtalk.intent.type])
            intent = new (SPECIAL_INTENT_MAP[thingtalk.intent.type])(thingtalk, context.platformData);
        else
            intent = new Intent.Failed(context.command, context.platformData);
    }
    return intent;
}

module.exports = {
    Intent,
    ValueCategory,
    DispatchResult
};
