package storage

import (
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/repos"
	"github.com/russross/blackfriday"
)

// getContentKey get html file key by sectionName
func (site *Site) getContentKey(contentName, fileName string) string {
	return site.GetSourceKey(repos.PrefixContents, contentName, fileName)
}

// GetContents get content models by contentName
func (site *Site) GetContents(contentName string) ([]map[string]string, error) {
	if contentName == "" {
		return []map[string]string{}, nil
	}
	if site.contents == nil {
		site.contents = make(map[string][]map[string]string)
	}

	contents, ok := site.contents[strings.ToLower(contentName)]
	if !ok {
		contents := []map[string]string{}
		fmt.Println(site.GetSourcePrefix(repos.PrefixContents, contentName))
		files, _ := site.GetAllFiles(site.GetSourcePrefix(repos.PrefixContents, contentName))
		for _, file := range files {
			if file.IsDir {
				continue
			}
			data := make(map[string]string)
			data["name"] = file.Name
			data["title"] = file.Name
			data["last_modified"] = file.LastModified
			data["content"] = site.getContent(file)

			contents = append(contents, data)
		}
	}

	return contents, nil
}

func (site *Site) getContent(file *get3w.File) string {
	templateContent, _ := site.Read(site.GetSourceKey(file.Path))
	if templateContent == "" {
		return ""
	}

	var parsedContent string

	ext := getExt(file.Name)
	if ext == ExtMD {
		parsedContent = string(blackfriday.MarkdownCommon([]byte(templateContent)))
	} else {
		parsedContent = templateContent
	}

	return parsedContent
}

func parseContent(path string, config *get3w.Config, page *get3w.Page, content map[string]string) string {
	templateContent := ""
	ext := getExt(page.ContentTemplateURL)
	if ext == ExtHTML {
		templateContent = page.ContentTemplate
	} else if ext == ExtMD {
		templateContent = string(blackfriday.MarkdownCommon([]byte(page.ContentTemplate)))
	}

	return parser.ParseContent(path, templateContent, config, page, content)
}
