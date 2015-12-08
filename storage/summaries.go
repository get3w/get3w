package storage

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/repos"
	"gopkg.in/yaml.v2"
)

// GetPageSummaries get SUMMARY.md file content
func (site *Site) GetPageSummaries() ([]*get3w.PageSummary, error) {
	if site.pageSummaries == nil {
		summaries := []*get3w.PageSummary{}

		data, err := site.Read(site.GetSourceKey(repos.KeySummary))
		if err != nil {
			return nil, err
		}

		summaries = getSummaries(data)
		site.pageSummaries = summaries
	}

	return site.pageSummaries, nil
}

func (site *Site) getPageBySummary(summary *get3w.PageSummary) *get3w.Page {
	page := &get3w.Page{}

	pageTemplate, _ := site.Read(site.GetSourceKey(summary.TemplateURL))

	ext := getExt(summary.TemplateURL)
	if ext == ExtYML {
		yaml.Unmarshal([]byte(pageTemplate), page)
	} else {
		page.PageTemplate = pageTemplate
	}

	if page.ContentTemplateURL != "" {
		contentTemplate, _ := site.Read(site.GetSourceKey(summary.ContentTemplateURL))
		page.ContentTemplate = contentTemplate
	}

	page.Name = summary.Name
	page.TemplateURL = summary.TemplateURL
	page.PageURL = summary.PageURL

	page.ContentName = summary.ContentName
	page.ContentTemplateURL = summary.ContentTemplateURL
	page.ContentPageURL = summary.ContentPageURL

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := site.getPageBySummary(child)
			page.Children = append(page.Children, childPage)
		}
	}

	return page
}

//var re = regexp.MustCompile(`\[([^\]]+)\]\(([^\s]+)\s+["|']([\s\S]+)["|']\)|\[([^\]]+)\]\(([^\)]+)\)`)
var (
	regexOuter = regexp.MustCompile(`\[([^\]]+)\]\(([^\)]+)\)(.*)`)
	regexInner = regexp.MustCompile(`([^'"]+)\s+['"]([^'"]+)['"]|([^'"]+)`)
)

func getSummaries(data string) []*get3w.PageSummary {
	pageSummaries := []*get3w.PageSummary{}

	if data == "" {
		return pageSummaries
	}

	lines := strings.Split(data, "\n")
	var previousSpaceNum int
	var previousParent *get3w.PageSummary

	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "*") {
			continue
		}
		arrOuter := regexOuter.FindStringSubmatch(line)
		if len(arrOuter) != 4 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
			continue
		}

		arrInner := regexInner.FindStringSubmatch(arrOuter[2])
		if len(arrInner) != 4 || arrInner[0] == "" {
			continue
		}

		name, templateURL, pageURL := arrOuter[1], "", ""
		if arrInner[3] == "" {
			templateURL, pageURL = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
		} else {
			templateURL = strings.TrimSpace(arrInner[3])
		}
		if pageURL == "" {
			pageURL = getPageURL(name, templateURL)
		}

		if name == "" || templateURL == "" || pageURL == "" {
			continue
		}

		spaceNum := strings.Index(line, "*")
		pageSummary := &get3w.PageSummary{
			Name:        name,
			TemplateURL: templateURL,
			PageURL:     pageURL,
		}

		contents := strings.TrimSpace(strings.Trim(arrOuter[3], "`"))
		if contents != "" {
			arrContents := regexInner.FindStringSubmatch(contents)
			if len(arrContents) == 4 && arrContents[0] != "" {
				cName, cTemplateURL, cPageURL := arrContents[1], "", ""
				if arrContents[3] == "" {
					cTemplateURL, cPageURL = strings.TrimSpace(arrContents[1]), strings.TrimSpace(arrContents[2])
				} else {
					cTemplateURL = strings.TrimSpace(arrContents[3])
				}
				if cPageURL == "" {
					cPageURL = getPageURL(cName, cTemplateURL)
				}

				if cName != "" && cTemplateURL != "" && cPageURL != "" {
					pageSummary.ContentName = cName
					pageSummary.ContentTemplateURL = cTemplateURL
					pageSummary.ContentPageURL = cPageURL
				}
			}
		}

		var parent *get3w.PageSummary
		if previousSpaceNum == spaceNum {
			parent = previousParent
		} else {
			parent = getParentPageSummary(spaceNum, pageSummaries)
		}

		if parent == nil {
			pageSummaries = append(pageSummaries, pageSummary)
		} else {
			parent.Children = append(parent.Children, pageSummary)
		}

		previousSpaceNum = spaceNum
		previousParent = parent
	}

	return pageSummaries
}

func getPageURL(name, templateURL string) string {
	pageURL := name + ExtHTML
	ext := getExt(templateURL)
	if ext == ExtYML {
		pageURL = strings.Replace(templateURL, ExtYML, ExtHTML, 1)
	} else if ext == ExtMD {
		pageURL = strings.Replace(templateURL, ExtMD, ExtHTML, 1)
	} else if ext == ExtHTML {
		pageURL = templateURL
	}
	return pageURL
}

func getParentPageSummary(spaceNum int, pageSummaries []*get3w.PageSummary) *get3w.PageSummary {
	if spaceNum == 0 || len(pageSummaries) == 0 {
		return nil
	}
	summary := pageSummaries[len(pageSummaries)-1]
	for i := 0; i < spaceNum; i++ {
		if len(summary.Children) == 0 {
			break
		}
		summary = summary.Children[len(summary.Children)-1]
	}
	return summary
}

// MarshalSummary parse page summary slice to string
func MarshalSummary(pageSummaries []*get3w.PageSummary) string {
	lines := []string{}
	lines = append(lines, "# Summary")
	lines = append(lines, "")

	lines = append(lines, getPageSummaryString(0, pageSummaries))

	retval := ""
	for _, line := range lines {
		retval += line + "\n"
	}
	return retval + "\n"
}

func getPageSummaryString(level int, pageSummaries []*get3w.PageSummary) string {
	retval := ""
	for _, summary := range pageSummaries {
		prefix := ""
		for i := 0; i < level; i++ {
			prefix += "\t"
		}
		if summary.PageURL == getPageURL(summary.Name, summary.TemplateURL) {
			retval += prefix + fmt.Sprintf("* [%s](%s)", summary.Name, summary.TemplateURL)
		} else {
			retval += prefix + fmt.Sprintf(`* [%s](%s "%s")`, summary.Name, summary.TemplateURL, summary.PageURL)
		}

		if summary.ContentName != "" && summary.ContentTemplateURL != "" && summary.ContentPageURL != "" {
			retval += "`"
			if summary.ContentPageURL == getPageURL(summary.ContentName, summary.ContentTemplateURL) {
				retval += prefix + fmt.Sprintf("[%s](%s)", summary.ContentName, summary.ContentTemplateURL)
			} else {
				retval += prefix + fmt.Sprintf(`[%s](%s "%s")`, summary.ContentName, summary.ContentTemplateURL, summary.ContentPageURL)
			}
			retval += "`"
		} else {
			retval += `\n`
		}

		if len(summary.Children) > 0 {
			retval += getPageSummaryString(level+1, summary.Children)
		}
	}
	return retval
}
