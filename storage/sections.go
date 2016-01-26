package storage

import (
	"bytes"
	"fmt"
	"regexp"
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
							if html, err := renderNode(node); err == nil {
								seq++
								single := sel.Eq(i)
								attrID, exists := single.Attr("id")
								if !exists {
									attrID = fmt.Sprintf("%d", seq)
								}
								sectionPath := page.Path + "#" + attrID
								parser.loadSectionWithContent(sectionPath, html)
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

// saveSection write content to section
func (parser *Parser) saveSection(section *get3w.Section) error {
	key := parser.key(section.Path)
	hash := ""
	if strings.Contains(section.Path, "#") {
		arr := strings.SplitN(section.Path, "#", 2)
		key = parser.key(arr[0])
		hash = arr[1]
	}

	sectionContent := ""
	if section.CSS != "" {
		sectionContent += fmt.Sprintf(`<style>%s</style>`, section.CSS) + "\n"
	}
	if section.HTML != "" {
		sectionContent += fmt.Sprintf(`%s`, section.HTML) + "\n"
	}
	if section.JS != "" {
		sectionContent += fmt.Sprintf(`<script>%s</script>`, section.JS) + "\n"
	}

	if hash == "" {
		if err := parser.Storage.Write(key, []byte(sectionContent)); err != nil {
			return err
		}
	} else {
		data, err := parser.Storage.Read(key)
		if err != nil {
			return err
		}

		doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(data)))
		if err != nil {
			return err
		}
		doc.Find("#" + hash).ReplaceWithHtml(sectionContent)
		html, err := doc.Html()
		if err != nil {
			return err
		}
		if err := parser.Storage.Write(key, []byte(html)); err != nil {
			return err
		}
	}

	return nil
}

// deleteSection delete section files
func (parser *Parser) deleteSection(sectionPath string) error {
	if err := parser.Storage.Delete(parser.key(sectionPath)); err != nil {
		return err
	}
	return nil
}

var (
	scriptExp = regexp.MustCompile(`<script[\s\S]*?>([\s\S]*?)</script>`)
	styleExp  = regexp.MustCompile(`<style[\s\S]*?>([\s\S]*?)</style>`)
)

func getSection(sectionPath, sectionContent string) *get3w.Section {
	if sectionPath == "" || sectionContent == "" {
		return nil
	}

	html := sectionContent
	css := ""
	js := ""

	captures := stringutils.FindFirstParenStrings(styleExp, sectionContent)
	if len(captures) > 0 {
		css = strings.Join(captures, "\n")
		html = styleExp.ReplaceAllString(html, "")
	}
	captures = stringutils.FindFirstParenStrings(scriptExp, sectionContent)
	if len(captures) > 0 {
		js = strings.Join(captures, "\n")
		html = scriptExp.ReplaceAllString(html, "")
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
		nodes := doc.Find("#" + hash).Nodes
		if len(nodes) > 0 {
			for _, node := range nodes {
				if node.Type == html.ElementNode {
					if html, err := renderNode(node); err == nil {
						sectionContent = html
						break
					}
				}
			}
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
