package storage

import (
	"strings"

	"github.com/get3w/get3w/pkg/fmatter"
)

var layouts = make(map[string]string)

func (parser *Parser) getTemplate(pageLayout, defaultLayout string) (template string, layout string) {
	layout = pageLayout
	if layout == "" {
		layout = defaultLayout
	}
	if layout == "" {
		return "", ""
	}
	ext := getExt(layout)
	if ext == "" {
		layout += ".html"
	}
	key := parser.key(PrefixLayouts, layout)
	template, ok := layouts[key]
	if !ok {
		data, _ := parser.Storage.Read(key)
		ext := getExt(layout)
		matter := make(map[string]string)
		content := fmatter.Read(data, matter)
		template = getStringByExt(ext, content)
		if parentLayout, ok := matter["layout"]; ok {
			parentTemplate, _ := parser.getTemplate(parentLayout, "")
			template = strings.Replace(parentTemplate, "{{ content }}", template, -1)
		}

		layouts[key] = template
	}

	return
}
