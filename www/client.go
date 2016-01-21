package main

import (
	"github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
)

var clientFlags = &cli.ClientFlags{FlagSet: new(flag.FlagSet), Common: commonFlags}

func init() {
	clientFlags.PostParse = func() {
		clientFlags.Common.PostParse()
	}
}
