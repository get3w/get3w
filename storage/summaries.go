package storage

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
)

var (
	regexOuter = regexp.MustCompile(`\[([^\]]+)\]\(([^\)]+)\)`)
	regexInner = regexp.MustCompile(`([^'"]+)\s+['"]([^'"]+)['"]|([^'"]+)`)
)

func (site *Site) getPageBySummary(summary *get3w.PageSummary) *get3w.Page {
	page := &get3w.Page{}

	data, _ := site.Read(site.GetSourceKey(summary.Path))
	ext := getExt(summary.Path)
	content := fmatter.Read(data, page)
	page.Content = getStringByExt(ext, content)

	page.Name = summary.Name
	page.Path = summary.Path
	if page.URL == "" {
		page.URL = summary.URL
	}

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := site.getPageBySummary(child)
			page.Children = append(page.Children, childPage)
		}
	}

	return page
}

func getLineElements(line string) (name, path, url string, ok bool) {
	arrOuter := regexOuter.FindStringSubmatch(line)
	if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
		return "", "", "", false
	}

	arrInner := regexInner.FindStringSubmatch(arrOuter[2])
	if len(arrInner) != 4 || arrInner[0] == "" {
		return "", "", "", false
	}

	name, path, url = arrOuter[1], "", ""
	if arrInner[3] == "" {
		path, url = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
	} else {
		path = strings.TrimSpace(arrInner[3])
	}
	if url == "" {
		url = getPageURL(name, path)
	}

	if name == "" || path == "" || url == "" {
		return "", "", "", false
	}

	return name, path, url, true
}

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

		name, path, url, ok := getLineElements(line)
		if !ok {
			continue
		}

		spaceNum := strings.Index(line, "*")
		pageSummary := &get3w.PageSummary{
			Name: name,
			Path: path,
			URL:  url,
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

func getPageURL(name, path string) string {
	pageURL := name + ExtHTML
	ext := getExt(path)
	if ext == ExtMD {
		pageURL = strings.Replace(path, ExtMD, ExtHTML, 1)
	} else if ext == ExtHTML {
		pageURL = path
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

// marshalSummary parse page summary slice to string
func marshalSummary(pageSummaries []*get3w.PageSummary) string {
	lines := []string{}
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
		if summary.URL == getPageURL(summary.Name, summary.Path) {
			retval += prefix + fmt.Sprintf("* [%s](%s)\n", summary.Name, summary.Path)
		} else {
			retval += prefix + fmt.Sprintf(`* [%s](%s "%s")\n`, summary.Name, summary.Path, summary.URL)
		}

		if len(summary.Children) > 0 {
			retval += getPageSummaryString(level+1, summary.Children)
		}
	}
	return retval
}
