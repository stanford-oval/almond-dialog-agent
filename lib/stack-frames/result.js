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

module.exports = class ResultStackFrame extends DialogStackFrame {
    get expecting() {
        return ValueCategory.MORE;
    }

    compatible(command) {
        return command instanceof Intent.More;
    }
};
