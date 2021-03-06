package main

import (
	"sort"

	"github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
)

var (
	flHelp    = flag.Bool([]string{"h", "-help"}, false, "Print usage")
	flVersion = flag.Bool([]string{"v", "-version"}, false, "Print version information and quit")
	flServer  = flag.Bool([]string{"s", "-server"}, false, "Run www server")
)

type byName []cli.Command

func (a byName) Len() int           { return len(a) }
func (a byName) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a byName) Less(i, j int) bool { return a[i].Name < a[j].Name }

var get3wCommands []cli.Command

// TODO(tiborvass): do not show 'daemon' on client-only binaries

func init() {
	for _, cmd := range cli.Get3WCommands {
		get3wCommands = append(get3wCommands, cmd)
	}
	sort.Sort(byName(get3wCommands))
}
