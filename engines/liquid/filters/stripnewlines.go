package filters

import (
	"regexp"

	"github.com/get3w/get3w/engines/liquid/core"
)

var stripNewLines = &ReplacePattern{regexp.MustCompile("(\n|\r)"), ""}

func StripNewLinesFactory(parameters []core.Value) core.Filter {
	return stripNewLines.Replace
}
