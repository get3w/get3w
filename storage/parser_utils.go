package storage

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/get3w/get3w"
)

func getSectionsHTML(config *get3w.Config, page *get3w.Page, sections []*get3w.Section) string {
	var buffer bytes.Buffer

	for _, sectionName := range page.Sections {
		section := getSection(sectionName, sections)
		if section == nil {
			continue
		}

		if section.CSS != "" {
			buffer.WriteString(fmt.Sprintf(`<style>
%s
</style>
`, strings.Replace(section.CSS, ".this", "#"+section.ID, -1)))
		}
		if section.HTML != "" {
			buffer.WriteString(fmt.Sprintf(`<section id="%s">
%s
</section>
`, section.ID, section.HTML))
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
