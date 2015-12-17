package filters

import (
	"regexp"

	"github.com/get3w/get3w/engines/liquid/core"
)

var stripHtml = &ReplacePattern{regexp.MustCompile("(?i)<script.*?</script>|<!--.*?-->|<style.*?</style>|<.*?>"), ""}

func StripHtmlFactory(parameters []core.Value) core.Filter {
	return stripHtml.Replace
}
