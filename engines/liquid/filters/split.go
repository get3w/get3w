package filters

import (
	"strings"

	"github.com/get3w/get3w/engines/liquid/core"
)

var defaultSplit = (&SplitFilter{&core.StaticStringValue{" "}}).Split

// Creates a join filter
func SplitFactory(parameters []core.Value) core.Filter {
	if len(parameters) == 0 {
		return defaultSplit
	}
	return (&SplitFilter{parameters[0]}).Split
}

type SplitFilter struct {
	on core.Value
}

// splits a value on the given value and returns an array
func (f *SplitFilter) Split(input interface{}, data map[string]interface{}) interface{} {
	on := core.ToString(f.on.Resolve(data))
	switch typed := input.(type) {
	case string:
		return strings.Split(typed, on)
	case []byte:
		return strings.Split(string(typed), on)
	default:
		return input
	}
}
