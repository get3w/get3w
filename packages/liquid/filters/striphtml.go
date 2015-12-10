package filters

import (
	"github.com/get3w/get3w/packages/liquid/core"
	"regexp"
)

var stripHtml = &ReplacePattern{regexp.MustCompile("(?i)<script.*?</script>|<!--.*?-->|<style.*?</style>|<.*?>"), ""}

func StripHtmlFactory(parameters []core.Value) core.Filter {
	return stripHtml.Replace
}
