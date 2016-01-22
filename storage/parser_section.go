package storage

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/get3w/get3w"
)

func (parser *Parser) getSectionsHTML(config *get3w.Config, page *get3w.Page) string {
	var buffer bytes.Buffer

	for _, sectionPath := range page.Sections {
		section, err := parser.getSection(sectionPath)
		if section == nil || err != nil {
			continue
		}

		if section.CSS != "" {
			buffer.WriteString(fmt.Sprintf(`<style>
%s
</style>
`, strings.Replace(section.CSS, ".this", "#"+section.Path, -1)))
		}
		if section.HTML != "" {
			buffer.WriteString(fmt.Sprintf(`<section id="%s">
%s
</section>
`, section.Path, section.HTML))
		}
		if section.JS != "" {
			buffer.WriteString(fmt.Sprintf(`<script>
%s
</script>
`, section.JS))
		}
	}

	return buffer.String()
}
