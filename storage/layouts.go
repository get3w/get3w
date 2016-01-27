package storage

import (
	"strings"

	"github.com/get3w/get3w"
)

// LoadSiteLayouts load layouts for current site
func (parser *Parser) LoadSiteLayouts() {
	parser.getLayout(parser.Config.Layout)
	files, _ := parser.Storage.GetAllFiles(parser.prefix(PrefixLayouts))
	for _, file := range files {
		if file.IsDir {
			continue
		}
		parser.getLayout(strings.Trim(strings.TrimLeft(file.Path, PrefixLayouts), "/"))
	}
}

func (parser *Parser) getLayout(layoutPath string) *get3w.Layout {
	if layoutPath == "" {
		layoutPath = parser.Config.Layout
	}
	if layoutPath == "" {
		return nil
	}
	ext := getExt(layoutPath)
	if ext == "" {
		layoutPath += ".html"
	}
	if parser.Current.Layouts == nil {
		parser.Current.Layouts = make(map[string]*get3w.Layout)
	}
	layout := parser.Current.Layouts[layoutPath]
	if layout != nil {
		return layout
	}

	if !parser.Storage.IsExist(parser.key(PrefixLayouts, layoutPath)) {
		layoutPath = parser.Config.Layout
	}

	if layoutPath == "" {
		return nil
	}

	matter := make(map[string]string)
	_, content := parser.read(matter, PrefixLayouts, layoutPath)
	if content == nil {
		return nil
	}

	layout = &get3w.Layout{}
	layout.Path = layoutPath
	layout.Content = getStringByExt(ext, content)

	if parentLayoutPath, ok := matter["layout"]; ok && parentLayoutPath != "" {
		if getExt(parentLayoutPath) == "" {
			parentLayoutPath += ".html"
		}
		if parentLayoutPath != layoutPath {
			layout.Layout = parentLayoutPath
		}
	}
	layout.FinalContent = layout.Content

	if layout.Layout != "" {
		parentLayout := parser.getLayout(layout.Layout)
		if parentLayout != nil && parentLayout.FinalContent != "" {
			layout.FinalContent = strings.Replace(parentLayout.FinalContent, "{{ content }}", layout.Content, -1)
		}
	}

	parser.Current.Layouts[layoutPath] = layout
	return layout
}
