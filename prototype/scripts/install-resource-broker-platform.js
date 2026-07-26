#!/usr/bin/env node
'use strict';

require(process.platform === 'win32'
  ? './install-resource-broker-wsl'
  : './install-resource-broker');
