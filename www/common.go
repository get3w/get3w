package main

import (
	"fmt"
	"os"

	"github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
)

const (
	defaultTrustKeyFile = "key.json"
	defaultCaFile       = "ca.pem"
	defaultKeyFile      = "key.pem"
	defaultCertFile     = "cert.pem"
)

var (
	daemonFlags *flag.FlagSet
	commonFlags = &cli.CommonFlags{FlagSet: new(flag.FlagSet)}
)

func init() {
	commonFlags.PostParse = postParseCommon

	cmd := commonFlags.FlagSet

	cmd.BoolVar(&commonFlags.Debug, []string{"D", "-debug"}, false, "Enable debug mode")
	cmd.StringVar(&commonFlags.LogLevel, []string{"l", "-log-level"}, "info", "Set the logging level")
}

func postParseCommon() {
	if commonFlags.LogLevel != "" {
		lvl, err := logrus.ParseLevel(commonFlags.LogLevel)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Unable to parse logging level: %s\n", commonFlags.LogLevel)
			os.Exit(1)
		}
		logrus.SetLevel(lvl)
	} else {
		logrus.SetLevel(logrus.InfoLevel)
	}

	if commonFlags.Debug {
		os.Setenv("DEBUG", "1")
		logrus.SetLevel(logrus.DebugLevel)
	}

}
