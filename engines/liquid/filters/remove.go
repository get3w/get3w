package filters

import (
	"github.com/get3w/get3w/engines/liquid/core"
)

func RemoveFactory(parameters []core.Value) core.Filter {
	if len(parameters) != 1 {
		return Noop
	}
	return (&ReplaceFilter{parameters[0], EmptyValue, -1}).Replace
}
