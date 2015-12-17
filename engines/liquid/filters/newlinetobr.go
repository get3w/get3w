package filters

import (
	"regexp"

	"github.com/get3w/get3w/engines/liquid/core"
)

var newLinesToBr = &ReplacePattern{regexp.MustCompile("(\n\r|\n|\r)"), "<br />\n"}

func NewLineToBrFactory(parameters []core.Value) core.Filter {
	return newLinesToBr.Replace
}
