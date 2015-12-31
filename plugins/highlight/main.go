// Always create a new binary
package main

import (
	"fmt"

	"github.com/get3w/get3w/packages"
)

// Highlight package
type Highlight struct{}

// Load plugin parameters
func (highlight Highlight) Load(options map[string]string, plugin *packages.Plugin) error {
	fmt.Println(options)
	plugin = &packages.Plugin{
		Hook: &packages.Hook{
			Name: "hook",
		},
	}
	fmt.Println("highlight package")
	return nil
}

func main() {
	highlight := &Highlight{}
	packages.Register(highlight)
}
