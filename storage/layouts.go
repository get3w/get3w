package storage

import (
	"strings"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
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

	if !parser.Storage.IsExist(parser.Storage.GetSourceKey(layoutPath)) {
		layoutPath = parser.Config.Layout
	}

	layout = &get3w.Layout{}
	data, _ := parser.Storage.Read(parser.Storage.GetSourceKey(layoutPath))
	if data == nil {
		if layoutPath == parser.Config.Layout {
			layout.Path = parser.Config.Layout
			layout.Layout = ""
			layout.Content = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<meta name="keywords" content="{{page.keywords}}"/>
				<meta name="description" content="{{page.description}}"/>
				<title>{{page.title}}</title>
				<link href="http://cdn.get3w.net/packages/csstoolkits/dist/ct.min.css" rel="stylesheet">
				<link href="http://cdn.get3w.net/packages/fontawesome/css/font-awesome.min.css" rel="stylesheet">
				<link href="http://cdn.get3w.net/packages/animate.css/animate.min.css" rel="stylesheet">
			</head>
			<body>
				{{page.sections}}
			</body>
			</html>`
			layout.FinalContent = layout.Content
		}
	} else {
		matter := make(map[string]string)
		content := fmatter.Read(data, matter)

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
	}

	parser.Current.Layouts[layoutPath] = layout
	return layout
}
