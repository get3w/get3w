package main

import (
	"github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/config"
	flag "github.com/get3w/get3w/pkg/mflag"
)

var clientFlags = &cli.ClientFlags{FlagSet: new(flag.FlagSet), Common: commonFlags}

func init() {
	client := clientFlags.FlagSet
	client.StringVar(&clientFlags.ConfigDir, []string{"-config"}, config.ConfigDir(), "Location of client config files")

	clientFlags.PostParse = func() {
		clientFlags.Common.PostParse()

		if clientFlags.ConfigDir != "" {
			config.SetConfigDir(clientFlags.ConfigDir)
		}
	}
}
