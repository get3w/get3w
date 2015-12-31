package packages

import (
	"github.com/dullgiulio/pingo"
)

// Extend contains extend method
type Extend interface {
	Load(options map[string]string, plugin *Plugin) error
}

// Register a new object this package exports. The object must be
// an interface of Extendable.
func Register(extend Extend) {
	pingo.Register(extend)
	pingo.Run()
}
