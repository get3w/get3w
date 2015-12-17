// Always create a new binary
package main

import (
	"fmt"

	"github.com/dullgiulio/pingo"
	"github.com/get3w/get3w-sdk-go/packages"
)

type MyPlugin struct{}

func (plugin *MyPlugin) Load(options map[string]string, extendable *packages.Extendable) error {
	fmt.Println(options)
	extendable = &packages.Extendable{
		Hook: &packages.Hook{
			Name: "hook",
		},
	}
	fmt.Println("highlight package")
	return nil
}

func main() {
	plugin := &MyPlugin{}
	// Register the objects to be exported
	pingo.Register(plugin)
	// Run the main events handler
	pingo.Run()
	//packages.Register(plugin)
}
