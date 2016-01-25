package storage

import (
	"strings"

	"github.com/get3w/get3w/pkg/fmatter"
)

var layouts = make(map[string]string)

const defaultLayoutContent = `<!DOCTYPE html>
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

func (parser *Parser) getLayoutContent(pageLayout, defaultLayout string) (layoutContent string, layout string) {
	layout = pageLayout
	if layout == "" {
		layout = defaultLayout
	}
	if layout == "" {
		return defaultLayoutContent, ""
	}
	ext := getExt(layout)
	if ext == "" {
		layout += ".html"
	}
	key := parser.key(PrefixLayouts, layout)
	layoutContent, ok := layouts[key]
	if !ok {
		data, _ := parser.Storage.Read(key)
		ext := getExt(layout)
		matter := make(map[string]string)
		content := fmatter.Read(data, matter)
		layoutContent = getStringByExt(ext, content)
		if parentLayout, ok := matter["layout"]; ok {
			parentTemplate, _ := parser.getLayoutContent(parentLayout, "")
			layoutContent = strings.Replace(parentTemplate, "{{ content }}", layoutContent, -1)
		}

		layouts[key] = layoutContent
	}

	return
}
