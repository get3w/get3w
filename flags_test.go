package main

import (
	"sort"
	"testing"
)

// Tests if the subcommands of get3w are sorted
func TestGet3WSubcommandsAreSorted(t *testing.T) {
	if !sort.IsSorted(byName(get3wCommands)) {
		t.Fatal("Get3W subcommands are not in sorted order")
	}
}
