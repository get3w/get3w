package storage

import (
	"bytes"
	"fmt"
	"strings"

	"golang.org/x/net/html"

	"github.com/PuerkitoBio/goquery"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// LoadSiteSections load pages for current site
func (parser *Parser) LoadSiteSections(pages []*get3w.Page) {
	if len(pages) > 0 {
		for _, page := range pages {
			if len(page.Sections) == 0 && page.Content != "" {
				page.Sections = []string{}

				pageContent := page.Content
				if !strings.Contains(page.Content, "</body>") {
					pageContent = "<body>" + page.Content + "</body>"
				}
				doc, err := goquery.NewDocumentFromReader(strings.NewReader(pageContent))
				if err != nil {
					page.Sections = append(page.Sections, page.Path)
				} else {
					seq := 0
					sel := doc.Find("body").Children()
					for i, node := range sel.Nodes {
						if node.Type == html.ElementNode {
							seq++
							single := sel.Eq(i)
							attrID, exists := single.Attr("id")
							if !exists {
								attrID = fmt.Sprintf("%d", seq)
							}
							if val, err := single.Html(); err == nil {
								sectionPath := page.Path + "#" + attrID
								parser.loadSectionWithContent(sectionPath, val)
								page.Sections = append(page.Sections, sectionPath)
							}
						}
					}
				}
			}

			for _, sectionPath := range page.Sections {
				parser.loadSectionWithoutContent(sectionPath)
			}
			parser.LoadSiteSections(page.Children)
		}
	}
}

// SaveSection write content to section
func (parser *Parser) SaveSection(section *get3w.Section) error {
	sectionKey := parser.key(section.Path)
	sectionContent := ""
	if section.HTML != "" {
		sectionContent += fmt.Sprintf(`%s`, section.HTML) + "\n"
	}
	if section.CSS != "" {
		sectionContent += fmt.Sprintf(`<style>%s</style>`, section.CSS) + "\n"
	}
	if section.JS != "" {
		sectionContent += fmt.Sprintf(`<script>%s</script>`, section.JS) + "\n"
	}
	if err := parser.Storage.Write(sectionKey, []byte(sectionContent)); err != nil {
		return err
	}

	return nil
	// 	previewHTML := `<!DOCTYPE html>
	// <html lang="en">
	// <head>
	//     <meta charset="utf-8">
	//     <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	//     <meta name="viewport" content="width=device-width, initial-scale=1">
	//     <title>` + section.Name + `</title>
	//     <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
	//     <link href="` + section.Name + `.css" rel="stylesheet">
	// </head>
	// <body>
	// <section class="this">
	//     ` + section.HTML + `
	// </section>
	// <script src="` + section.Name + `.js"></script>
	// </body>
	// </html>`
	// 	parser.WritePreview(parser.getSectionKey(section.Name+parser.ExtHTML), []byte(previewHTML))
}

// DeleteSection delete section files
func (parser *Parser) DeleteSection(sectionPath string) error {
	if err := parser.Storage.Delete(parser.key(sectionPath)); err != nil {
		return err
	}
	return nil
}

func getSection(sectionPath, sectionContent string) *get3w.Section {
	if sectionPath == "" || sectionContent == "" {
		return nil
	}

	html := sectionContent
	css := ""
	js := ""

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(sectionContent))
	if err == nil {
		doc.Find("style").Each(func(i int, s *goquery.Selection) {
			if val, err := s.Html(); err == nil {
				css += val
			}
			s.Remove()
		})
		doc.Find("script").Each(func(i int, s *goquery.Selection) {
			if val, err := s.Html(); err == nil {
				js += val
			}
			s.Remove()
		})
		if css != "" || js != "" {
			if val, err := doc.Find("body").Html(); err == nil {
				html = val
			}
		}
	}

	if html == "" && css == "" && js == "" {
		return nil
	}

	return &get3w.Section{
		Path: sectionPath,
		HTML: html,
		CSS:  css,
		JS:   js,
	}
}

func (parser *Parser) loadSectionWithoutContent(sectionPath string) (*get3w.Section, error) {
	if parser.Current.Sections == nil {
		parser.Current.Sections = make(map[string]*get3w.Section)
	}
	section := parser.Current.Sections[sectionPath]
	if section != nil {
		return section, nil
	}

	key := sectionPath
	hash := ""
	if strings.Contains(sectionPath, "#") {
		arr := strings.SplitN(sectionPath, "#", 2)
		key = arr[0]
		hash = arr[1]
	}

	data, err := parser.Storage.Read(parser.key(key))
	if err != nil {
		return nil, err
	}

	sectionContent := ""
	if hash == "" {
		sectionContent = string(data)
	} else {
		doc, err := goquery.NewDocumentFromReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		html, err := doc.Find("#" + hash).Html()
		if err == nil {
			sectionContent = `<div id="` + hash + `">` + html + `</div>`
		}
	}

	section = getSection(sectionPath, sectionContent)
	if section != nil {
		parser.Current.Sections[sectionPath] = section
	}

	return section, nil
}

func (parser *Parser) loadSectionWithContent(sectionPath, sectionContent string) (*get3w.Section, error) {
	if parser.Current.Sections == nil {
		parser.Current.Sections = make(map[string]*get3w.Section)
	}
	section := parser.Current.Sections[sectionPath]
	if section != nil {
		return section, nil
	}

	section = getSection(sectionPath, sectionContent)
	if section != nil {
		parser.Current.Sections[sectionPath] = section
	}

	return section, nil
}

func (parser *Parser) parseSections(config *get3w.Config, page *get3w.Page) string {
	var buffer bytes.Buffer

	for _, sectionPath := range page.Sections {
		section, err := parser.loadSectionWithoutContent(sectionPath)
		if section == nil || err != nil {
			continue
		}

		sectionID := stringutils.Base64ForURLEncode(section.Path)

		buffer.WriteString(fmt.Sprintf("\n<section id=\"%s\">\n", sectionID))

		html := section.HTML
		css := ""
		js := ""
		if section.CSS != "" {
			css = fmt.Sprintf("<style>%s</style>\n", strings.Replace(section.CSS, ".this", "#"+sectionID, -1))
		}
		if section.JS != "" {
			js = fmt.Sprintf("<script>%s</script>\n", section.JS)
		}

		buffer.WriteString(css + html + js)
		buffer.WriteString("\n</section>\n")

	}

	return buffer.String()
}
