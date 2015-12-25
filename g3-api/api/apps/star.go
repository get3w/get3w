package apps

import (
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/labstack/echo"
)

// Star app
func Star(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	owner = api.Owner(c)
	appDAO := dao.NewAppDAO()
	starAppDAO := dao.NewStarAppDAO()
	starUserDAO := dao.NewStarUserDAO()
	authDAO := dao.NewAuthDAO()

	input := &get3w.AppStarInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	if input.Star {
		starAppDAO.Insert(app.ID, owner)
		starUserDAO.Insert(owner, app.ID)
	} else {
		starAppDAO.Delete(app.ID, owner)
		starUserDAO.Delete(owner, app.ID)
	}

	starCount, err := starAppDAO.GetStarCount(app.ID)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	err = appDAO.UpdateStarCount(app.Owner, app.Name, starCount)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	userStar, err := starUserDAO.GetStarred(owner)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	err = authDAO.UpdateStarred(owner, userStar)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.AppStarOutput{
		StarCount: starCount,
	}
	return c.JSON(http.StatusOK, output)
}
